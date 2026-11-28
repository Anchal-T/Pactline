import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { asId, type OfferId, type ProductConfigId, type ProjectId, type VendorId } from "@pactline/domain";
import { applyMigrations, createDb, offerRev, PostgresGatewayStore, WorldStore, type DB, type PgPool } from "@pactline/db";
import type { GatewayStore, NewReceipt } from "./execution-gateway.js";

describe("PostgresGatewayStore contract", () => {
  it("structurally satisfies GatewayStore at compile time", () => {
    const typeCheck = (store: PostgresGatewayStore): GatewayStore => store;
    expect(typeof typeCheck).toBe("function");
  });
});

const TEST_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_URL ? describe : describe.skip;

describeIfDb("PostgresGatewayStore against Postgres", () => {
  const run = randomUUID().slice(0, 8);
  const offerId = asId<OfferId>(`offer-gw-${run}`);
  let db: DB;
  let pool: PgPool;
  let now = new Date("2026-12-15T10:00:00Z");

  beforeAll(async () => {
    if ([process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED].includes(TEST_URL)) {
      throw new Error("TEST_DATABASE_URL must target a dedicated test database");
    }
    await applyMigrations(TEST_URL!);
    ({ db, pool } = createDb(TEST_URL!));
    const world = new WorldStore(db);
    const project = asId<ProjectId>(`proj-gw-${run}`);
    const vendor = asId<VendorId>(`v-gw-${run}`);
    const cfg = asId<ProductConfigId>(`cfg-gw-${run}`);
    await world.schedule.upsertProject({ id: project, name: "Gateway store test" });
    await world.procurement.upsertVendor({ id: vendor, name: "Vendor" });
    await world.engineering.upsertProductConfiguration({
      id: cfg,
      manufacturer: "Demo",
      model: "M1",
      equipmentType: "CENTRIFUGAL_PUMP",
      specs: {},
      sourceRefs: ["src-1"],
      trustTier: "primary",
    });
    await world.engineering.createSupplierOffer({
      id: offerId,
      projectId: project,
      vendorId: vendor,
      productConfigId: cfg,
      quantity: 2,
      currency: "USD",
      quotedAt: new Date("2026-12-01T00:00:00Z"),
      expiresAt: new Date("2026-12-18T23:59:59Z"),
      evidenceRef: "quote://gw-test",
    });
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
  });

  it("resolves an offer pin to the offer row's expiry and nothing else", async () => {
    const store = new PostgresGatewayStore(db, () => now);
    const pinned = offerRev(offerId, 1);
    expect(await store.transaction((tx) => tx.getOffer(pinned))).toEqual({
      offer_rev: pinned,
      expires_at: new Date("2026-12-18T23:59:59Z"),
    });
    expect(await store.transaction((tx) => tx.getOffer(offerRev(offerId, 2)))).toBeNull();
    expect(await store.transaction((tx) => tx.getOffer(offerId))).toBeNull();
  });

  it("fences result writes on the claim that is still current", async () => {
    const store = new PostgresGatewayStore(db, () => now);
    const receipt: NewReceipt = {
      action_id: `act-${run}`,
      idempotency_key: `action:gw-${run}`,
      status: "PENDING",
      action_type: "send_vendor_email",
      action_class: "EXTERNAL_WRITE",
      incident_id: null,
      subject_id: "pol-gw",
      actor: "op-1",
      reason: "Follow up",
      arguments: { body: "Hi" },
      tainted_arguments: [],
      approval_id: null,
      recipient: "vendor@example.com",
      template_id: "vendor_update",
      dispatched_at: null,
      confirmed_at: null,
      external_id: null,
      error: null,
      lease_expires_at: null,
      retry_count: 0,
    };
    const outcome = await store.transaction((tx) => tx.insertReceipt(receipt));
    if (!outcome.inserted) throw new Error("receipt not inserted");
    const id = outcome.receipt_id;

    const a = (await store.transaction((tx) => tx.claim(id, now, new Date(now.getTime() + 1000))))!.receipt;
    now = new Date(now.getTime() + 2000);
    const b = (await store.transaction((tx) => tx.claim(id, now, new Date(now.getTime() + 60_000))))!.receipt;

    const stale = await store.transaction(async (tx) => [
      await tx.markConfirmed(a, "ext-stale"),
      await tx.markFailed(a, "stale failure"),
      await tx.markUncertain(a, "stale uncertain"),
    ]);
    expect(stale).toEqual([false, false, false]);
    expect(await store.transaction((tx) => tx.getReceiptByKey(receipt.idempotency_key))).toMatchObject({
      status: "DISPATCHING",
      retry_count: 2,
      error: null,
    });

    expect(await store.transaction((tx) => tx.markConfirmed(b, "ext-b"))).toBe(true);
    expect(await store.transaction((tx) => tx.markFailed(b, "after confirm"))).toBe(false);
    expect(await store.transaction((tx) => tx.getReceiptByKey(receipt.idempotency_key))).toMatchObject({
      status: "CONFIRMED",
      external_id: "ext-b",
    });
  });
});
