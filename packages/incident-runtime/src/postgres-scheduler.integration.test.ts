import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { asId, type ActivityId, type IncidentId, type MaterialNeedId, type PackageId, type ProjectId } from "@pactline/domain";
import { connect, migrate, PostgresGatewayStore, PostgresIncidentQueue, PostgresReceiptReader, PostgresTaskQueue, WorldStore, type DB, type PgPool } from "@pactline/db";
import { ExecutionGateway, SandboxExternalAdapter } from "@pactline/execution-gateway";
import { IncidentRuntime, MemoryEventStore, VirtualClock } from "./incident-runtime.js";
import { MemoryAuditLog } from "./memory-stores.js";
import type { Decider, Outbox } from "./ports.js";

const TEST_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_URL ? describe : describe.skip;

const SCHEMA = "pl_test_scheduler_runtime";
const T0 = "2026-12-14T09:00:00Z";
const LEASE_MS = 60_000;
const VENDOR = "expedite@vendor.example";
const INC = asId<IncidentId>("inc-pg-0001");

const chase: Decider = async (_i, now) => ({
  kind: "FOLLOW_UP",
  next_review_at: new Date(now.getTime() + 48 * 3_600_000),
  action: { action_type: "send_vendor_email", actor: "operator", reason: "No response on revised ship date", arguments: { po_line: "pol-pump-001" }, recipient: VENDOR, template_id: "supplier-follow-up-v1" },
});

describeIfDb("IncidentRuntime on the Postgres scheduler store", () => {
  let pool: PgPool;
  let db: DB;

  beforeAll(async () => {
    const target = (u: string) => {
      const url = new URL(u);
      return `${url.hostname.toLowerCase().replace(/-pooler(?=\.)/, "")}:${url.port}${url.pathname}`;
    };
    for (const appUrl of [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED]) {
      if (appUrl && target(appUrl) === target(TEST_URL!)) throw new Error("TEST_DATABASE_URL must target a dedicated test database");
    }
    ({ db, pool } = await connect({ url: TEST_URL!, searchPath: SCHEMA, max: 6 }));
    await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await migrate(pool, SCHEMA);
    const world = new WorldStore(db, () => new Date(T0));
    const project = asId<ProjectId>("proj-pg"), pkg = asId<PackageId>("pkg-pg"), need = asId<MaterialNeedId>("need-pg");
    await world.schedule.upsertProject({ id: project, name: "Runtime test" });
    await world.procurement.upsertEquipmentPackage({ id: pkg, projectId: project, type: "CENTRIFUGAL_PUMP", description: "Pump", requiredQuantity: 2, status: "ACTIVE" });
    await world.procurement.upsertMaterialNeed({ id: need, projectId: project, packageId: pkg, activityId: asId<ActivityId>("act-pg"), requiredQuantity: 2, requiredUsableDate: "2026-12-30", readinessBufferDays: 2 });
    await world.incidents.createIncident({ id: INC, projectId: project, packageId: pkg, materialNeedId: need, severity: "WARNING", status: "EXECUTING", owner: "operator", nextAction: "Monitor vendor commitment", nextReviewAt: new Date(T0), requiredQty: 2 });
  }, 120_000);

  afterAll(async () => {
    await pool?.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).catch(() => undefined);
    await pool?.end();
  });

  it("hands over actions committed by a worker that crashed before enqueue, writing exactly once", async () => {
    const clock = new VirtualClock(T0);
    const sandbox = new SandboxExternalAdapter();
    const gatewayStore = new PostgresGatewayStore(db, () => clock.now());
    const gateway = new ExecutionGateway({ store: gatewayStore, adapter: sandbox, clock: () => clock.now(), policy: { allowedRecipients: [VENDOR], leaseDurationSeconds: LEASE_MS / 1000 } });
    const incidents = new PostgresIncidentQueue(db);
    const worker = (workerId: string, outbox: Outbox) =>
      new IncidentRuntime(clock, new MemoryEventStore(), {
        workerId,
        incidents,
        tasks: new PostgresTaskQueue(db),
        outbox,
        receipts: new PostgresReceiptReader(db),
        audit: new MemoryAuditLog(),
        decide: chase,
        runTask: async () => Promise.reject(new Error("no tasks")),
        policy: { leaseMs: LEASE_MS },
      });

    const dying: Outbox = { authorize: (p) => gateway.authorize(p), enqueue: () => new Promise(() => {}), tickOutbox: (n) => gateway.tickOutbox(n) };
    void worker("w1", dying).tickIncidents();
    await vi.waitFor(async () => expect(await incidents.pendingActions(10)).toHaveLength(1), { timeout: 30_000 });

    const w2 = worker("w2", gateway);
    expect(await w2.tickIncidents()).toBe(0);
    await w2.tickIncidents();
    await w2.tickOutbox();

    const { rows } = await pool.query("SELECT action_id, status FROM action_receipts");
    expect(rows).toEqual([{ action_id: `${INC}:follow-up:1`, status: "CONFIRMED" }]);
    expect(sandbox.getOperationCount()).toBe(1);
    expect(await incidents.pendingActions(10)).toEqual([]);
  });
});
