import { readFileSync } from "node:fs";
import type { Assertion, SourceRef, SpecialistResult } from "@pactline/domain";
import { describe, expect, it } from "vitest";
import { canonicalizePumpModel, detectConflicts, jaroWinkler, matchPumpModels, resolvePumpModel, trigramSimilarity } from "./index.js";

interface ReferenceConfig {
  id: string;
  manufacturer: string;
  family: string;
  model: string;
  impeller_diameter_in: number;
  catalog_connection?: { suction_in: number; discharge_in: number };
}

const reference = JSON.parse(readFileSync(new URL("../../../data/specs/pump-reference.json", import.meta.url), "utf8")) as { product_configurations: ReferenceConfig[] };
const config = (id: string) => reference.product_configurations.find((c) => c.id === id)!;
const fromReference = (c: ReferenceConfig) =>
  canonicalizePumpModel(c.model, { manufacturer: c.manufacturer, series: c.family, impellerIn: c.impeller_diameter_in, suctionIn: c.catalog_connection?.suction_in, dischargeIn: c.catalog_connection?.discharge_in });

const BG = config("cfg-bg-e1510-125bc-950-1750");
const TACO = config("cfg-taco-fi1206d-625-1760");

describe("canonicalizePumpModel", () => {
  it("canonicalises the Bell & Gossett reference configuration", () => {
    const m = fromReference(BG);
    expect(m).toMatchObject({ manufacturer: "BELL_GOSSETT", series: "e-1510", model: "1.25BC", dischargeIn: 1.25, impellerIn: 9.5, suctionIn: null, status: "PARTIAL", unresolved: ["suctionIn"] });
    expect(m.key).toBe("BELL_GOSSETT/e-1510/1.25BC/?x1.25x9.5");
  });

  it("canonicalises the Taco reference configuration with its drawing connection sizes", () => {
    const m = fromReference(TACO);
    expect(m).toMatchObject({ manufacturer: "TACO", series: "FI", model: "FI1206D", suctionIn: 2, dischargeIn: 1.25, impellerIn: 6.25, status: "COMPLETE", unresolved: [], conflicts: [] });
    expect(m.key).toBe("TACO/FI/FI1206D/2x1.25x6.25");
  });

  it("reads submittal-style spellings to the same key", () => {
    const a = canonicalizePumpModel('Bell & Gossett Series e-1510 1-1/4BC, 9-1/2" impeller');
    const b = canonicalizePumpModel("B&G E1510 1 1/4 BC trim 9.5");
    expect(a.key).toBe("BELL_GOSSETT/e-1510/1.25BC/?x1.25x9.5");
    expect(b.key).toBe(a.key);
    expect(canonicalizePumpModel("Taco FI 1206D, 2 x 1-1/4, 6.25 in trim").key).toBe("TACO/FI/FI1206D/2x1.25x6.25");
  });

  it("returns UNKNOWN for text it cannot parse, never a guess", () => {
    const m = canonicalizePumpModel("pump per spec, see attached");
    expect(m).toMatchObject({ status: "UNKNOWN", manufacturer: null, series: null, model: null, dischargeIn: null });
    expect(m.key).toBe("?/?/?/?x?x?");
  });

  it("nulls a field whose sources contradict each other", () => {
    const m = canonicalizePumpModel("Taco FI1206D 6.25 in trim", { impellerIn: 6.0, dischargeIn: 1.5 });
    expect(m.impellerIn).toBeNull();
    expect(m.dischargeIn).toBeNull();
    expect(m.conflicts).toEqual(["dischargeIn", "impellerIn"]);
    expect(m.status).toBe("PARTIAL");
  });
});

describe("similarity", () => {
  it("matches published Jaro-Winkler values", () => {
    expect(jaroWinkler("MARTHA", "MARHTA")).toBeCloseTo(0.9611, 4);
    expect(jaroWinkler("DWAYNE", "DUANE")).toBeCloseTo(0.84, 4);
    expect(jaroWinkler("DIXON", "DICKSONX")).toBeCloseTo(0.8133, 4);
    expect(jaroWinkler("ABC", "ABC")).toBe(1);
    expect(jaroWinkler("", "ABC")).toBe(0);
  });

  it("computes pg_trgm similarity", () => {
    expect(trigramSimilarity("word", "word")).toBe(1);
    expect(trigramSimilarity("word", "two words")).toBeCloseTo(4 / 11, 6);
  });
});

describe("matchPumpModels", () => {
  const bg = fromReference(BG);

  it("MATCHes a submittal spelling of the same configuration with per-field contributions", () => {
    const r = matchPumpModels(canonicalizePumpModel('B&G e-1510 1-1/4 BC 9-1/2" impeller'), bg);
    expect(r.decision).toBe("MATCH");
    expect(r.contributions.map((c) => [c.field, c.level])).toEqual([
      ["manufacturer", "EXACT"],
      ["series", "EXACT"],
      ["model", "EXACT"],
      ["suctionIn", "MISSING"],
      ["dischargeIn", "EXACT"],
      ["impellerIn", "EXACT"],
    ]);
    expect(r.score).toBeCloseTo(r.contributions.reduce((s, c) => s + c.weight, 0), 10);
  });

  it("does not MATCH the same model on a different impeller diameter", () => {
    const r = matchPumpModels(canonicalizePumpModel("B&G e-1510 1-1/4BC 8.75 in impeller"), bg);
    expect(r.decision).not.toBe("MATCH");
    expect(r.contributions.find((c) => c.field === "impellerIn")).toMatchObject({ level: "DISAGREE", left: 8.75, right: 9.5 });
  });

  it("NON_MATCHes a different manufacturer's pump", () => {
    expect(matchPumpModels(fromReference(TACO), bg).decision).toBe("NON_MATCH");
  });

  it("scores a near-spelling of the model as FUZZY agreement", () => {
    const r = matchPumpModels(canonicalizePumpModel("Taco FI1206 6.25 in trim"), fromReference(TACO));
    expect(r.contributions.find((c) => c.field === "model")).toMatchObject({ level: "FUZZY" });
  });
});

describe("resolvePumpModel", () => {
  it("blocks on trigrams and ranks candidates deterministically", () => {
    const records = [
      { id: "cfg-taco-fi1206d-625-1760", model: fromReference(TACO) },
      { id: "cfg-bg-e1510-125bc-950-1750", model: fromReference(BG) },
    ];
    const out = resolvePumpModel(canonicalizePumpModel("Taco FI1206D, 6.25 in trim"), records);
    expect(out.map((c) => c.id)).toEqual(["cfg-taco-fi1206d-625-1760"]);
    expect(out[0]!.decision).toBe("MATCH");
  });
});

describe("detectConflicts", () => {
  const HASH = `sha256:${"a".repeat(64)}`;
  const ref = (ref_id: string, excerpt: string): SourceRef => ({
    ref_id,
    kind: "public_registry",
    uri: `sandbox://refs/${ref_id}`,
    title: ref_id,
    retrieved_at: "2026-11-26T09:00:00Z",
    content_hash: HASH,
    locator: { row: 1 },
    excerpt,
    trust_tier: "primary",
  });
  const assertion = (claim_key: string, value: unknown, refId: string): Assertion => ({
    claim_key,
    value,
    confidence: { score: 0.9, method: "deterministic", tier: "CERTAIN", evidence_coverage: 1, reason: "cited" },
    refs: [refId],
  });
  const env = (specialist: string, run: string, assertions: Assertion[], evidence: SourceRef[]): SpecialistResult =>
    ({ specialist, run_id: `run_${run.padEnd(26, "0")}`, assertions, evidence }) as unknown as SpecialistResult;

  const KEY = "vendor.pl:vendor:ven-002.debarred";

  it("raises a disagreement carrying both citations, ordered independently of input", () => {
    const s4 = env("spec_compliance", "A", [assertion(KEY, false, "r4")], [ref("r4", "No exclusions on file.")]);
    const s7 = env("vendor_risk", "B", [assertion(KEY, true, "r7")], [ref("r7", "Excluded 2026-10-01.")]);
    const forward = detectConflicts([s4, s7]);
    expect(detectConflicts([s7, s4])).toEqual(forward);
    expect(forward).toHaveLength(1);
    expect(forward[0]).toMatchObject({
      type: "DisagreementRaised",
      claim_key: KEY,
      left: { specialist: "spec_compliance", value: false, citations: [{ ref_id: "r4", excerpt: "No exclusions on file." }] },
      right: { specialist: "vendor_risk", value: true, citations: [{ ref_id: "r7", excerpt: "Excluded 2026-10-01." }] },
    });
  });

  it("raises nothing when assertions agree, including on key order inside objects", () => {
    const a = env("lead_time", "A", [assertion("po_line.pl:po_line:po-1.eta", { p50: "2026-12-20", unit: "date" }, "r1")], [ref("r1", "ETA")]);
    const b = env("expediter", "B", [assertion("po_line.pl:po_line:po-1.eta", { unit: "date", p50: "2026-12-20" }, "r2")], [ref("r2", "ETA")]);
    expect(detectConflicts([a, b])).toEqual([]);
  });
});
