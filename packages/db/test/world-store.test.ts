// Integration test against the real Neon database, isolated in a throwaway schema that is dropped afterwards.
// Skipped when no database URL is configured.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { connect, migrate, seed, type DbHandle } from "../src/index.js";
import * as t from "../src/schema/index.js";

const ROOT = join(__dirname, "..", "..", "..");
if (existsSync(join(ROOT, ".env"))) process.loadEnvFile(join(ROOT, ".env"));
const URL_ = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const SCHEMA = `pl_test_${process.pid}_${Date.now().toString(36)}`;

describe.skipIf(!URL_)("world store on Neon", () => {
  let h: DbHandle;

  beforeAll(async () => {
    const admin = await connect({ url: URL_, max: 1 });
    await migrate(admin.pool, SCHEMA);
    await admin.close();
    h = await connect({ url: URL_, searchPath: SCHEMA, max: 2 });
    await seed(h.db, ROOT);
  }, 120_000);

  afterAll(async () => {
    await h?.pool.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await h?.close();
  });

  const rejects = async (q: string, params: unknown[] = []) => {
    const err = await h.pool.query(q, params).then(() => null, (e: Error & { code?: string }) => e);
    expect(err, q).not.toBeNull();
    return err!;
  };

  it("loads the fixtures", async () => {
    const lines = await h.db.select().from(t.poLines);
    expect(lines.map((l) => l.id).sort()).toEqual(["pol-pump-001", "pol-pump-anchor-001", "pol-pump-tie-in-001"]);
    expect(lines.find((l) => l.id === "pol-pump-001")?.packageId).toBe("pkg-pump-chw-001");
    const configs = await h.db.select().from(t.productConfigurations);
    expect(configs).toHaveLength(2);
    // documentBlocks no longer exists; evidence is stored as evidenceSources
    const sources = await h.db.select().from(t.evidenceSources);
    expect(sources.length).toBeGreaterThan(0);
  });

  it("is idempotent", async () => {
    await seed(h.db, ROOT);
    expect(await h.db.select().from(t.vendorCommitments)).toHaveLength(3);
  });

  it("re-applying migrations is a no-op", async () => {
    expect(await migrate(h.pool, SCHEMA)).toEqual([]);
  });

  it("invariant 7: refuses to change or delete the BASELINE schedule", async () => {
    expect((await rejects(`UPDATE schedule_revisions SET network = '{}' WHERE kind = 'BASELINE'`)).message).toContain("immutable");
    await rejects(`DELETE FROM schedule_revisions WHERE kind = 'BASELINE'`);
    await h.pool.query(`UPDATE schedule_revisions SET network = network WHERE kind = 'CURRENT'`);
  });

  it("invariant 1: refuses an allocation beyond the PO line quantity", async () => {
    const e = await rejects(`INSERT INTO fulfillment_allocations (id, po_line_id, material_need_id, quantity) VALUES ('alloc-x', 'pol-pump-001', 'need-pump-chw-001', 1)`);
    expect(e.message).toContain("exceeds PO line");
  });

  it("keeps vendor commitments append-only", async () => {
    await rejects(`UPDATE vendor_commitments SET arrival_date = '2027-02-01' WHERE id = 'commit-pump-chw-001'`);
    await rejects(`DELETE FROM vendor_commitments WHERE id = 'commit-pump-chw-001'`);
    await h.pool.query(`UPDATE vendor_commitments SET valid_to = now() WHERE id = 'commit-pump-chw-001'`);
    await rejects(`UPDATE vendor_commitments SET valid_to = now() WHERE id = 'commit-pump-chw-001'`);
  });

  it("invariant 8: refuses an open incident without an owner, review time and next step", async () => {
    await rejects(`INSERT INTO incidents (id, project_id, status, severity) VALUES ('INC-X', 'proj-hvac-demo-001', 'DETECTED', 'CRITICAL')`);
    await h.pool.query(`INSERT INTO incidents (id, project_id, status, severity, owner, next_review_at, next_action) VALUES ('INC-Y', 'proj-hvac-demo-001', 'DETECTED', 'CRITICAL', 'operator', now(), 'investigate')`);
  });

  it("invariant 3: refuses an offer without evidence or expiry", async () => {
    await rejects(`INSERT INTO supplier_offers (id, vendor_id, product_config_id, quantity, expires_at) VALUES ('offer-x', 'supplier-demo-pumps', 'cfg-x', 1, now())`);
    await rejects(`INSERT INTO supplier_offers (id, vendor_id, product_config_id, quantity, evidence_ref) VALUES ('offer-y', 'supplier-demo-pumps', 'cfg-x', 1, 'doc://x')`);
  });
});
