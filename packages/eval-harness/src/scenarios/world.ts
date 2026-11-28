// Scenario 11: two incidents race for the same PO line against the real Postgres WorldStore on an isolated database.
import { randomUUID } from "node:crypto";
import {
  asId,
  type ActivityId,
  type AllocationId,
  type IncidentId,
  type MaterialNeedId,
  type PackageId,
  type POLineId,
  type ProjectId,
  type PurchaseOrderId,
  type VendorId,
} from "@pactline/domain";
import { AllocationExceededError, WorldStore, applyMigrations, createDb } from "@pactline/db";
import { type PendingScenario, type RunnableScenario, type Scenario, check } from "../harness.js";

const ID = 11;
const TITLE = "Parallel incidents contending on the same POLine";

/** host (pooler suffix stripped), port and database: two URLs with the same target are the same database. */
function databaseTarget(url: string): string {
  const u = new URL(url);
  return JSON.stringify([u.hostname.toLowerCase().replace(/-pooler(?=\.)/, ""), u.port || "5432", u.pathname]);
}

/** Refuses to run unless the test URL is set and is not the application database. Never falls back to DATABASE_URL. */
function isolatedUrl(testUrl: string): string {
  for (const appUrl of [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED]) {
    if (appUrl && databaseTarget(appUrl) === databaseTarget(testUrl)) {
      throw new Error("TEST_DATABASE_URL must target a dedicated test database, not DATABASE_URL");
    }
  }
  return testUrl;
}

/** SANDBOX fixture: one PO line for a pair of chilled-water pumps; two incidents each need both pumps. */
function fixture(run: string) {
  const id = <T extends string>(name: string) => asId<T>(`s11-${run}-${name}`);
  return {
    project: id<ProjectId>("proj"),
    vendor: id<VendorId>("vendor"),
    pkg: id<PackageId>("pkg-chwp"),
    po: id<PurchaseOrderId>("po"),
    poLine: id<POLineId>("pol-chwp"),
    needs: [id<MaterialNeedId>("need-chwp-1"), id<MaterialNeedId>("need-chwp-2")] as const,
    activities: [id<ActivityId>("act-set-chwp-1"), id<ActivityId>("act-set-chwp-2")] as const,
    incidents: [id<IncidentId>("inc-a"), id<IncidentId>("inc-b")] as const,
    allocations: [id<AllocationId>("alloc-a"), id<AllocationId>("alloc-b")] as const,
    retry: id<AllocationId>("alloc-b-retry"),
  };
}

type Fixture = ReturnType<typeof fixture>;
const LINE_QTY = 2;

async function seed(world: WorldStore, f: Fixture) {
  await world.schedule.upsertProject({ id: f.project, name: "Scenario 11 sandbox project" });
  await world.procurement.upsertVendor({ id: f.vendor, name: "Sandbox pump vendor", isSandbox: true });
  await world.procurement.upsertEquipmentPackage({
    id: f.pkg,
    projectId: f.project,
    type: "CENTRIFUGAL_PUMP",
    description: "CHW pumps P-CHW-01A/B",
    requiredQuantity: LINE_QTY,
    status: "ACTIVE",
  });
  for (const [i, need] of f.needs.entries()) {
    await world.procurement.upsertMaterialNeed({
      id: need,
      projectId: f.project,
      packageId: f.pkg,
      activityId: f.activities[i]!,
      requiredQuantity: LINE_QTY,
      requiredUsableDate: "2026-12-30",
      readinessBufferDays: 2,
    });
  }
  await world.procurement.upsertPurchaseOrder({ id: f.po, projectId: f.project, vendorId: f.vendor, status: "RELEASED" });
  await world.procurement.upsertPoLine({
    id: f.poLine,
    poId: f.po,
    packageId: f.pkg,
    quantity: LINE_QTY,
    contractualArrivalDate: "2026-12-28",
    status: "OPEN",
  });
}

async function run(testUrl: string) {
  const url = isolatedUrl(testUrl);
  await applyMigrations(url);
  const { db, pool } = createDb(url);
  const world = new WorldStore(db);
  const f = fixture(randomUUID().slice(0, 8));
  const activeSum = async () =>
    Number((await pool.query<{ total: string }>(
      "SELECT COALESCE(SUM(quantity), 0) AS total FROM fulfillment_allocations WHERE po_line_id = $1 AND status = 'ACTIVE'",
      [f.poLine],
    )).rows[0]?.total);
  try {
    await seed(world, f);
    // Both incidents allocate the whole line at the same moment, each on its own pooled connection.
    const race = await Promise.allSettled(
      f.incidents.map((incidentId, i) =>
        world.procurement.allocateFulfillment({
          id: f.allocations[i]!,
          poLineId: f.poLine,
          materialNeedId: f.needs[i]!,
          quantity: LINE_QTY,
          incidentId,
        }),
      ),
    );
    const winners = race.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    const losers = race.flatMap((r) => (r.status === "rejected" ? [r.reason as unknown] : []));
    const afterRace = await world.procurement.getPoLineWithAllocations(f.poLine);
    const sumAfterRace = await activeSum();

    // Control: once the winning incident releases its allocation, the other incident's allocation fits.
    const winner = winners[0];
    const released = winner ? await world.procurement.releaseFulfillmentAllocation(asId<AllocationId>(winner.id)) : null;
    const loserIndex = winner ? f.incidents.findIndex((inc) => inc !== winner.incidentId) : 1;
    const retry = await world.procurement.allocateFulfillment({
      id: f.retry,
      poLineId: f.poLine,
      materialNeedId: f.needs[loserIndex]!,
      quantity: LINE_QTY,
      incidentId: f.incidents[loserIndex]!,
    });
    const after = await world.procurement.getPoLineWithAllocations(f.poLine);
    const active = (rows: NonNullable<typeof after>["allocations"] = []) => rows.filter((a) => a.status === "ACTIVE");

    return [
      check("exactly one concurrent allocation succeeds", winners.length, 1),
      check("the other is rejected", losers.length, 1),
      check("the rejection is AllocationExceededError", losers[0] instanceof AllocationExceededError, true),
      check(
        "the rejection reports the full line already held",
        losers[0] instanceof AllocationExceededError ? [losers[0].lineQuantity, losers[0].activeAllocated, losers[0].requested] : null,
        [LINE_QTY, LINE_QTY, LINE_QTY],
      ),
      check("one ACTIVE allocation row after the race", active(afterRace?.allocations).length, 1),
      check("SUM(active qty) <= po_line.qty after the race", sumAfterRace <= Number(afterRace?.line.quantity), true),
      check("the ACTIVE allocation belongs to the winning incident", active(afterRace?.allocations)[0]?.incidentId, winner?.incidentId),
      check("control: the winner's allocation is RELEASED", released?.status, "RELEASED"),
      check("control: after release the other incident's allocation succeeds", [retry.status, retry.incidentId], ["ACTIVE", f.incidents[loserIndex]]),
      check("control: still exactly one ACTIVE allocation", active(after?.allocations).map((a) => a.id), [f.retry]),
      check("control: SUM(active qty) equals the line qty", await activeSum(), LINE_QTY),
    ];
  } finally {
    // Remove only this run's rows (allocations, lines and needs cascade from the project).
    await pool.query("DELETE FROM projects WHERE id = $1", [f.project]).catch(() => undefined);
    await pool.query("DELETE FROM vendors WHERE id = $1", [f.vendor]).catch(() => undefined);
    await pool.end();
  }
}

/** Runnable only with TEST_DATABASE_URL pointing at an isolated database; otherwise registered as PENDING. */
export function parallelPoLineContention(env: NodeJS.ProcessEnv = process.env): Scenario {
  const testUrl = env.TEST_DATABASE_URL;
  if (!testUrl) {
    return { id: ID, title: TITLE, blockedBy: "Needs TEST_DATABASE_URL pointing at an isolated Neon branch (ANC-60)" } satisfies PendingScenario;
  }
  return { id: ID, title: TITLE, run: () => run(testUrl) } satisfies RunnableScenario;
}
