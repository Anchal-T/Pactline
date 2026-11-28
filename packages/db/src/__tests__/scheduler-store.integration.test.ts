import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import pg from "pg";
import { asId, type ActivityId, type IncidentId, type MaterialNeedId, type PackageId, type ProjectId, type RevisionSubjectId } from "@pactline/domain";
import {
  createDb,
  migrate,
  PostgresGatewayStore,
  PostgresIncidentQueue,
  PostgresReceiptReader,
  PostgresTaskQueue,
  specialistTasks,
  WorldStore,
  type ActionProposalRecord,
  type DB,
  type SchedulerIncident,
} from "../index.js";

const TEST_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_URL ? describe : describe.skip;

/** Own schema, so this file never truncates tables another integration file is using. */
const SCHEMA = "pl_test_scheduler_store";
const T0 = new Date("2026-12-14T09:00:00Z");
const LEASE_MS = 60_000;
const at = (ms: number) => new Date(T0.getTime() + ms);

const ids = {
  project: asId<ProjectId>("proj-sched"),
  pkg: asId<PackageId>("pkg-sched"),
  need: asId<MaterialNeedId>("need-sched"),
  pol: asId<RevisionSubjectId>("pol-sched"),
};

const followUp = (incidentId: string, n: number): ActionProposalRecord => ({
  action_id: `${incidentId}:follow-up:${n}`,
  incident_id: incidentId,
  action_type: "send_vendor_email",
  actor: "operator",
  reason: "No response on revised ship date",
  arguments: { po_line: "pol-sched" },
  recipient: "expedite@vendor.example",
  template_id: "supplier-follow-up-v1",
});

const sameTarget = (a: string, b: string) => {
  const t = (u: string) => {
    const { host, port, database } = new pg.Client({ connectionString: u });
    return JSON.stringify([host.toLowerCase().replace(/-pooler(?=\.)/, ""), port, database]);
  };
  return t(a) === t(b);
};

describeIfDb("Postgres scheduler store (incident-runtime ports)", () => {
  let pool: pg.Pool;
  let db: DB;
  let world: WorldStore;
  let incidents: PostgresIncidentQueue;
  let tasks: PostgresTaskQueue;

  beforeAll(async () => {
    for (const appUrl of [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED]) {
      if (appUrl && sameTarget(appUrl, TEST_URL!)) throw new Error("TEST_DATABASE_URL must target a dedicated test database");
    }
    pool = new pg.Pool({ connectionString: TEST_URL!, options: `-c search_path=${SCHEMA},public`, max: 6 });
    await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await migrate(pool, SCHEMA);
    db = createDb(pool).db;
    world = new WorldStore(db, () => T0);
    incidents = new PostgresIncidentQueue(db);
    tasks = new PostgresTaskQueue(db);
  }, 120_000);

  afterAll(async () => {
    await pool?.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).catch(() => undefined);
    await pool?.end();
  });

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE TABLE incident_action_proposals, action_receipts, specialist_tasks, incident_audit_events, approvals, incidents, subject_revisions, material_needs, equipment_packages, projects CASCADE`);
    await world.schedule.upsertProject({ id: ids.project, name: "Scheduler test" });
    await world.procurement.upsertEquipmentPackage({ id: ids.pkg, projectId: ids.project, type: "CENTRIFUGAL_PUMP", description: "Pump", requiredQuantity: 2, status: "ACTIVE" });
    await world.procurement.upsertMaterialNeed({ id: ids.need, projectId: ids.project, packageId: ids.pkg, activityId: asId<ActivityId>("act-sched"), requiredQuantity: 2, requiredUsableDate: "2026-12-30", readinessBufferDays: 2 });
  }, 60_000);

  const openIncident = (id: string) =>
    world.incidents.createIncident({
      id: asId<IncidentId>(id),
      projectId: ids.project,
      packageId: ids.pkg,
      materialNeedId: ids.need,
      severity: "WARNING",
      status: "EXECUTING",
      owner: "operator",
      nextAction: "Monitor vendor commitment",
      nextReviewAt: T0,
      requiredQty: 2,
    });

  const reviewed = (row: SchedulerIncident, n: number): SchedulerIncident => ({ ...row, follow_ups: n, next_review_at: at(48 * 3_600_000) });

  it("rejects the stale worker's commit after its lease expired and another worker reclaimed", async () => {
    await openIncident("inc-a");
    const [stale] = await incidents.claimDue("w1", T0, LEASE_MS, 10);
    expect(stale?.row).toMatchObject({ id: "inc-a", status: "EXECUTING", follow_ups: 0, failures: 0, required_qty: 2 });
    expect(await incidents.claimDue("w2", at(1), LEASE_MS, 10)).toEqual([]);

    const later = at(LEASE_MS + 1);
    const [fresh] = await incidents.claimDue("w2", later, LEASE_MS, 10);
    expect(fresh?.token).not.toBe(stale!.token);
    expect(await incidents.commit(stale!, later, reviewed(stale!.row, 1), [followUp("inc-a", 1)])).toBe("LEASE_LOST");
    expect(await incidents.pendingActions(10)).toEqual([]);

    expect(await incidents.commit(fresh!, later, reviewed(fresh!.row, 1), [followUp("inc-a", 1)])).toBe("COMMITTED");
    expect(await world.incidents.getIncident(asId<IncidentId>("inc-a"))).toMatchObject({ followUps: 1, version: 2, leaseToken: null, leaseHolder: null });
    expect(await incidents.pendingActions(10)).toEqual([followUp("inc-a", 1)]);
  });

  it("rejects a commit after the row changed under a live lease", async () => {
    await openIncident("inc-b");
    const [lease] = await incidents.claimDue("w1", T0, LEASE_MS, 10);
    await db.execute(sql`UPDATE incidents SET version = version + 1, next_action = 'Human edit' WHERE id = 'inc-b'`);
    expect(await incidents.commit(lease!, at(1), reviewed(lease!.row, 1), [])).toBe("LEASE_LOST");
    expect((await world.incidents.getIncident(asId<IncidentId>("inc-b")))?.nextAction).toBe("Human edit");
  });

  it("rolls back the commit and its actions when the update breaks the invariant-8 CHECK", async () => {
    await openIncident("inc-c");
    const [lease] = await incidents.claimDue("w1", T0, LEASE_MS, 10);
    await expect(incidents.commit(lease!, at(1), { ...lease!.row, owner: null }, [followUp("inc-c", 1)])).rejects.toThrow();
    expect(await incidents.pendingActions(10)).toEqual([]);
  });

  it("never gives one incident to two concurrent claimers (SKIP LOCKED)", async () => {
    const all = ["inc-1", "inc-2", "inc-3", "inc-4", "inc-5", "inc-6"];
    for (const id of all) await openIncident(id);
    const batches = await Promise.all(["x", "y", "z"].map((w) => incidents.claimDue(w, T0, LEASE_MS, 3)));
    const taken = batches.flat().map((l) => l.row.id);
    expect(new Set(taken).size).toBe(taken.length);
    expect([...taken].sort()).toEqual(all);
  });

  it("drains recorded actions after a crash exactly once, however often the drain repeats", async () => {
    await openIncident("inc-d");
    const [lease] = await incidents.claimDue("w1", T0, LEASE_MS, 10);
    await incidents.commit(lease!, at(1), reviewed(lease!.row, 1), [followUp("inc-d", 1)]);
    // w1 dies here. Two restarted workers drain concurrently through the gateway's idempotent insert.
    const gateway = new PostgresGatewayStore(db, () => at(2));
    const drain = async () => {
      const handoffs: boolean[] = [];
      for (const action of await new PostgresIncidentQueue(db).pendingActions(10)) {
        const outcome = await gateway.transaction((tx) =>
          tx.insertReceipt({
            action_id: action.action_id,
            idempotency_key: `action:${action.action_id}`,
            status: "PENDING",
            action_type: action.action_type,
            action_class: "EXTERNAL_WRITE",
            incident_id: action.incident_id,
            subject_id: null,
            actor: action.actor,
            reason: action.reason,
            arguments: action.arguments,
            tainted_arguments: [],
            approval_id: null,
            recipient: action.recipient ?? null,
            template_id: action.template_id ?? null,
            dispatched_at: null,
            confirmed_at: null,
            external_id: null,
            error: null,
            lease_expires_at: null,
            retry_count: 0,
          }),
        );
        const receiptId = outcome.inserted ? outcome.receipt_id : outcome.reason === "DUPLICATE" ? outcome.existing.receipt_id : null;
        handoffs.push(await incidents.markHandedOff(action.action_id, at(2), { receipt_id: receiptId, error: null }));
      }
      return handoffs;
    };
    const [a, b] = await Promise.all([drain(), drain()]);
    expect([...a!, ...b!].filter(Boolean)).toHaveLength(1);
    expect(await drain()).toEqual([]);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM action_receipts");
    expect(rows[0].n).toBe(1);
  });

  it("does not record an action twice when a later commit repeats its action_id", async () => {
    await openIncident("inc-e");
    const [l1] = await incidents.claimDue("w1", T0, LEASE_MS, 10);
    await incidents.commit(l1!, at(1), { ...l1!.row, next_review_at: T0 }, [followUp("inc-e", 1)]);
    const [l2] = await incidents.claimDue("w1", at(2), LEASE_MS, 10);
    expect(await incidents.commit(l2!, at(3), reviewed(l2!.row, 1), [followUp("inc-e", 1)])).toBe("COMMITTED");
    expect(await incidents.pendingActions(10)).toHaveLength(1);
  });

  it("completes a task against current revisions and marks it STALE after a revision bump", async () => {
    await openIncident("inc-t");
    await world.incidents.upsertSubjectRevisions({ subjectId: ids.pol, subjectType: "POLine", pins: { config_rev: "1" }, now: T0 });
    const insert = (objective: string) =>
      db.insert(specialistTasks).values({
        incidentId: "inc-t",
        projectId: ids.project,
        role: "INVESTIGATION",
        objective,
        inputPayload: { po_line: ids.pol },
        statePin: { config_rev: "1" },
        pinSubjectId: ids.pol,
        status: "PENDING",
        availableAt: T0,
      });
    await insert("current");
    const [current] = await tasks.claim("w1", T0, LEASE_MS, 1);
    expect(current?.row).toMatchObject({ status: "RUNNING", attempts: 1, pin: { config_rev: "1" } });
    expect(await tasks.claim("w2", at(1), LEASE_MS, 1)).toEqual([]);
    const result = { status: "OK", input_versions: { config_rev: "1" } } as never;
    expect(await tasks.complete(current!, at(1), { kind: "RESULT", result })).toBe("COMPLETED");

    await insert("drifted");
    const [drifted] = await tasks.claim("w1", at(2), LEASE_MS, 1);
    await world.incidents.bumpRevisionAndInvalidateApprovals({ subjectId: ids.pol, subjectType: "POLine", pins: { config_rev: "2" }, reason: "spec revised", now: at(3) });
    expect(await tasks.complete(drifted!, at(4), { kind: "RESULT", result })).toBe("STALE");

    await insert("expired");
    const [expired] = await tasks.claim("w1", at(5), LEASE_MS, 1);
    expect(await tasks.complete(expired!, at(5 + LEASE_MS), { kind: "RESULT", result })).toBe("LEASE_LOST");
    const [reclaimed] = await tasks.claim("w2", at(5 + LEASE_MS), LEASE_MS, 1);
    expect(reclaimed?.row.attempts).toBe(2);
  });

  it("reads UNCERTAIN and FAILED receipts for an incident", async () => {
    await openIncident("inc-r");
    await pool.query(
      `INSERT INTO action_receipts (action_id, idempotency_key, status, action_type, action_class, incident_id, actor, reason, arguments)
       VALUES ('a1', 'k1', 'UNCERTAIN', 'send_vendor_email', 'EXTERNAL_WRITE', 'inc-r', 'op', 'r', '{}'),
              ('a2', 'k2', 'CONFIRMED', 'send_vendor_email', 'EXTERNAL_WRITE', 'inc-r', 'op', 'r', '{}')`,
    );
    const unresolved = await new PostgresReceiptReader(db).unresolved(asId<IncidentId>("inc-r"));
    expect(unresolved.map((r) => [r.action_id, r.status])).toEqual([["a1", "UNCERTAIN"]]);
  });
});
