import { describe, expect, it } from "vitest";
import { EntityRefSchema, FindingSchema, LocatorSchema, SourceRefSchema, specialistResultSchema } from "../contracts.js";
import { envelope, finding, HASH, ref, ResultSchema } from "./fixtures.js";

const schema = specialistResultSchema(ResultSchema);

describe("SourceRef", () => {
  it("accepts a primary datasheet ref", () => expect(SourceRefSchema.safeParse(ref()).success).toBe(true));
  it("rejects an excerpt over 300 characters", () => expect(SourceRefSchema.safeParse(ref({ excerpt: "x".repeat(301) })).success).toBe(false));
  it("requires a content hash and an excerpt unless the ref is derived", () => {
    expect(SourceRefSchema.safeParse(ref({ content_hash: undefined })).success).toBe(false);
    expect(SourceRefSchema.safeParse(ref({ excerpt: "  " })).success).toBe(false);
    expect(SourceRefSchema.safeParse(ref({ kind: "derived", trust_tier: "derived", content_hash: undefined, excerpt: "" })).success).toBe(true);
  });
  it("rejects a derived kind with a document trust tier", () => {
    const r = SourceRefSchema.safeParse(ref({ kind: "derived", trust_tier: "primary", content_hash: undefined }));
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message)).toContain("a derived ref must have trust_tier derived");
  });
  it("rejects unknown keys", () => expect(SourceRefSchema.safeParse({ ...ref(), surprise: 1 }).success).toBe(false));
  it("rejects an inverted bbox", () => expect(LocatorSchema.safeParse({ page: 1, bbox: [10, 10, 5, 20] }).success).toBe(false));
});

describe("EntityRef", () => {
  it("needs an id prefix that matches the type", () => {
    expect(EntityRefSchema.safeParse({ type: "vendor", id: "pl:vendor:acme" }).success).toBe(true);
    expect(EntityRefSchema.safeParse({ type: "vendor", id: "pl:po_line:acme" }).success).toBe(false);
    expect(EntityRefSchema.safeParse({ type: "vendor", id: "acme" }).success).toBe(false);
  });
});

describe("Finding", () => {
  it("requires a dotted upper-case code", () => {
    expect(FindingSchema.safeParse(finding({ code: "head_low" })).success).toBe(false);
    expect(FindingSchema.safeParse(finding({ code: "PUMP.HEAD.BELOW_DUTY" })).success).toBe(true);
  });
  it("keeps confidence and severity independent: a BLOCKER can be POSSIBLE", () => {
    const e = envelope({
      findings: [finding({ severity: "BLOCKER", type: "noncompliance", verdict: "FAIL" })],
      confidence: { score: 0.4, method: "heuristic", tier: "POSSIBLE", evidence_coverage: 0.5, reason: "one extraction only" },
    });
    expect(schema.safeParse(e).success).toBe(true);
  });
});

describe("SpecialistResult envelope", () => {
  it("accepts a valid envelope and defaults assertions", () => {
    const { assertions: _omit, ...rest } = envelope();
    const r = schema.safeParse(rest);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.assertions).toEqual([]);
  });
  it("rejects a finding that cites a ref not in evidence", () => {
    const r = schema.safeParse(envelope({ findings: [finding({ evidence: ["missing"] })] }));
    expect(r.success).toBe(false);
  });
  it("rejects duplicate ref ids", () => expect(schema.safeParse(envelope({ evidence: [ref(), ref()] })).success).toBe(false));
  it("requires a handoff for NEEDS_HUMAN", () => expect(schema.safeParse(envelope({ status: "NEEDS_HUMAN" })).success).toBe(false));
  it("rejects a blocking handoff beside status OK", () => {
    const handoff = { reason_code: "LOW_CONFIDENCE" as const, question: "Confirm?", options: [{ id: "a", label: "A", effect: "e" }], required_role: "ENGINEER_OF_RECORD" as const, due_by: "2026-11-28T10:00:00Z", blocking: true, context_refs: ["r1"] };
    expect(schema.safeParse(envelope({ handoff })).success).toBe(false);
    expect(schema.safeParse(envelope({ status: "NEEDS_HUMAN", handoff })).success).toBe(true);
  });
  it("rejects a malformed run id, key and unknown top-level keys", () => {
    expect(schema.safeParse(envelope({ run_id: "run_123" })).success).toBe(false);
    expect(schema.safeParse(envelope({ idempotency_key: "abc" })).success).toBe(false);
    expect(schema.safeParse({ ...envelope(), extra: true }).success).toBe(false);
  });
  it("checks the typed result payload", () => expect(schema.safeParse(envelope({ result: { summary: 3 } as never })).success).toBe(false));
  it("uses a sha256 key format", () => expect(HASH).toMatch(/^sha256:[0-9a-f]{64}$/));
});
