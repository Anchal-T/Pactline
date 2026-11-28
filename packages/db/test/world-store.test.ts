// Integration test against the real Neon database, isolated in a throwaway schema that is dropped afterwards.
// Skipped when no database URL is configured.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
    const sources = await h.db.select().from(t.evidenceSources);
    expect(sources.length).toBeGreaterThan(0);
    const reqs = await h.db.select().from(t.requirements);
    expect(reqs.length).toBeGreaterThan(0);
  });

  it("is idempotent", async () => {
    await seed(h.db, ROOT);
    expect(await h.db.select().from(t.vendorCommitments)).toHaveLength(3);
  });

  it("re-applying migrations is a no-op", async () => {
    expect(await migrate(h.pool, SCHEMA)).toEqual([]);
  });

  it("invariant 7: refuses to change or delete the BASELINE schedule", async () => {
    const updErr = await rejects(`UPDATE schedule_revisions SET calendar = '{}' WHERE kind = 'BASELINE'`);
    expect(updErr.message).toContain("immutable");
    const delErr = await rejects(`DELETE FROM schedule_revisions WHERE kind = 'BASELINE'`);
    expect(delErr.message).toContain("immutable");
    await h.pool.query(`UPDATE schedule_revisions SET calendar = calendar WHERE kind = 'CURRENT'`);
  });

  it("invariant 1: refuses an allocation beyond the PO line quantity", async () => {
    const e = await rejects(
      `INSERT INTO fulfillment_allocations (id, po_line_id, material_need_id, quantity, status) VALUES ('alloc-x', 'pol-pump-001', 'need-pump-chw-001', 1, 'ACTIVE')`,
    );
    expect(e.message).toContain("exceed");
  });

  it("enforces vendor commitment kind check", async () => {
    const e = await rejects(
      `INSERT INTO vendor_commitments (po_line_id, commitment_kind, promised_arrival_date, observed_at, source, taint_status) VALUES ('pol-pump-001', 'INVALID_KIND', '2027-02-01', now(), 'test', 'verified')`,
    );
    expect(e.code).toBe("23514");
  });

  it("invariant 8: refuses an open incident without an owner, review time and next step", async () => {
    const e = await rejects(
      `INSERT INTO incidents (id, project_id, package_id, material_need_id, required_qty, status, severity) VALUES ('INC-X', 'proj-hvac-demo-001', 'pkg-pump-chw-001', 'need-pump-chw-001', 2, 'DETECTED', 'CRITICAL')`,
    );
    expect(e.code).toBe("23514");
    await h.pool.query(
      `INSERT INTO incidents (id, project_id, package_id, material_need_id, required_qty, status, severity, owner, next_review_at, next_action) VALUES ('INC-Y', 'proj-hvac-demo-001', 'pkg-pump-chw-001', 'need-pump-chw-001', 2, 'DETECTED', 'CRITICAL', 'operator', now(), 'investigate')`,
    );
  });

  it("invariant 3: refuses an offer without evidence or valid expiry", async () => {
    const noEv = await rejects(
      `INSERT INTO supplier_offers (id, project_id, vendor_id, product_config_id, quantity, currency, quoted_at, expires_at, evidence_ref) VALUES ('offer-x', 'proj-hvac-demo-001', 'supplier-demo-pumps', 'cfg-bg-e1510-125bc-950-1750', 1, 'USD', now(), now() + interval '7 days', '   ')`,
    );
    expect(noEv.code).toBe("23514");
    const badExp = await rejects(
      `INSERT INTO supplier_offers (id, project_id, vendor_id, product_config_id, quantity, currency, quoted_at, expires_at, evidence_ref) VALUES ('offer-y', 'proj-hvac-demo-001', 'supplier-demo-pumps', 'cfg-bg-e1510-125bc-950-1750', 1, 'USD', now(), now() - interval '1 day', 'doc://x')`,
    );
    expect(badExp.code).toBe("23514");
  });
});
