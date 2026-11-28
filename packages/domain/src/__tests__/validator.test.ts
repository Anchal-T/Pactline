import { describe, expect, it } from "vitest";
import { normalizeText, parseAndValidate, validateEnvelope } from "../validator.js";
import { context, envelope, finding, NOW, ref, ResultSchema } from "./fixtures.js";

describe("clean envelope", () => {
  it("passes untouched", () => {
    const v = validateEnvelope(envelope(), context());
    expect(v.ok).toBe(true);
    expect(v.presentable).toBe(true);
    expect(v.issues).toEqual([]);
    expect(v.envelope.status).toBe("OK");
    expect(v.envelope.confidence.tier).toBe("CERTAIN");
  });
  it("does not mutate its input", () => {
    const input = envelope({ evidence: [ref({ excerpt: "not in the block" })] });
    const before = JSON.stringify(input);
    validateEnvelope(input, context());
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe("rule 3: verbatim excerpts", () => {
  it("matches across whitespace differences", () => {
    expect(normalizeText("a \n  b\tc")).toBe("a b c");
    const v = validateEnvelope(envelope({ evidence: [ref({ excerpt: "Head at 100 m3/h  :\n36.1 m." })] }), context());
    expect(v.issues).toEqual([]);
  });
  it("drops a ref whose excerpt is not in the block and turns the claim UNKNOWN", () => {
    const v = validateEnvelope(envelope({ evidence: [ref({ excerpt: "Head at 100 m3/h : 41.0 m." })] }), context());
    expect(v.issues.map((i) => i.code)).toContain("EXCERPT_NOT_FOUND");
    expect(v.envelope.evidence).toEqual([]);
    expect(v.envelope.findings[0]!.evidence).toEqual([]);
    expect(v.envelope.findings[0]!.verdict).toBe("UNKNOWN");
  });
  it("fails closed when the source cannot be loaded", () => {
    const v = validateEnvelope(envelope(), context({ sourceText: () => undefined }));
    expect(v.issues.map((i) => i.code)).toContain("SOURCE_UNAVAILABLE");
    expect(v.envelope.evidence).toEqual([]);
  });
  it("caps the tier at POSSIBLE when any ref is dropped, keeping the good ones", () => {
    const bad = ref({ ref_id: "r2", excerpt: "invented sentence" });
    const v = validateEnvelope(envelope({ evidence: [ref(), bad], findings: [finding({ evidence: ["r1", "r2"] })] }), context());
    expect(v.envelope.evidence.map((r) => r.ref_id)).toEqual(["r1"]);
    expect(v.envelope.findings[0]!.evidence).toEqual(["r1"]);
    expect(v.envelope.findings[0]!.verdict).toBe("PASS");
    expect(v.envelope.confidence.tier).toBe("POSSIBLE");
    expect(v.envelope.status).toBe("PARTIAL");
  });
  it("skips the text check for derived refs", () => {
    const derived = ref({ kind: "derived", trust_tier: "derived", content_hash: undefined, excerpt: "PCHIP(100 m3/h) = 36.1 m" });
    const subject = { type: "activity" as const, id: "pl:activity:act-pump-installation" };
    const v = validateEnvelope(envelope({ evidence: [derived], findings: [finding({ subject })] }), context({ sourceText: () => "" }));
    expect(v.issues).toEqual([]);
  });
  it("checks the excerpt of a ref that claims kind derived without trust_tier derived", () => {
    const forged = ref({ kind: "derived", trust_tier: "primary", content_hash: undefined, excerpt: "Head at 100 m3/h : 41.0 m." });
    const v = validateEnvelope(envelope({ evidence: [forged] }), context());
    expect(v.issues.map((i) => i.code)).toContain("EXCERPT_NOT_FOUND");
    expect(v.envelope.evidence).toEqual([]);
    expect(v.envelope.findings[0]!.verdict).toBe("UNKNOWN");
    expect(v.envelope.status).not.toBe("OK");
    expect(v.presentable).toBe(false);
  });
  it("drops a ref with trust_tier derived but a document kind when its source cannot be loaded", () => {
    const v = validateEnvelope(envelope({ evidence: [ref({ trust_tier: "derived" })] }), context({ sourceText: () => undefined }));
    expect(v.issues.map((i) => i.code)).toContain("SOURCE_UNAVAILABLE");
    expect(v.envelope.findings[0]!.verdict).toBe("UNKNOWN");
  });
});

describe("rule 2: no invention", () => {
  it("rejects a finding about an entity that does not resolve", () => {
    const v = validateEnvelope(envelope({ findings: [finding({ subject: { type: "vendor", id: "pl:vendor:made-up-pumps" } })] }), context({ resolveEntity: () => false }));
    expect(v.ok).toBe(false);
    expect(v.envelope.status).toBe("ERROR");
    expect(v.presentable).toBe(false);
    expect(v.issues.map((i) => i.code)).toContain("ENTITY_UNRESOLVED");
  });
  it("rejects a vendor identity supported only by derived values", () => {
    const derived = ref({ kind: "derived", trust_tier: "derived", content_hash: undefined, excerpt: "" });
    const v = validateEnvelope(envelope({ evidence: [derived], findings: [finding({ subject: { type: "vendor", id: "pl:vendor:acme" } })] }), context());
    expect(v.issues.map((i) => i.code)).toContain("IDENTITY_FROM_DERIVED");
    expect(v.ok).toBe(false);
  });
  it("allows a derived ref for a non-identity subject", () => {
    const derived = ref({ kind: "derived", trust_tier: "derived", content_hash: undefined, excerpt: "" });
    const v = validateEnvelope(envelope({ evidence: [derived], findings: [finding({ subject: { type: "activity", id: "pl:activity:act-pump-installation" } })] }), context());
    expect(v.ok).toBe(true);
  });
});

describe("rule 1: no source, no claim", () => {
  it("turns an unsourced verdict into UNKNOWN and hands off", () => {
    const v = validateEnvelope(envelope({ findings: [finding({ evidence: [] })] }), context());
    expect(v.envelope.findings[0]!.verdict).toBe("UNKNOWN");
    expect(v.envelope.status).toBe("NEEDS_HUMAN");
    expect(v.envelope.handoff?.reason_code).toBe("MISSING_EVIDENCE");
    expect(v.envelope.handoff?.blocking).toBe(true);
    expect(v.missingEvidence[0]).toContain("PUMP.HEAD.AT_DUTY");
    expect(new Date(v.envelope.handoff!.due_by).getTime()).toBeGreaterThan(NOW.getTime());
  });
  it("lets a plain INFO finding stand without a source", () => {
    const v = validateEnvelope(envelope({ findings: [finding({ verdict: undefined, evidence: [] })] }), context());
    expect(v.issues).toEqual([]);
  });
  it("forces NEEDS_HUMAN when an OK result cites nothing", () => {
    const v = validateEnvelope(envelope({ evidence: [], findings: [] }), context());
    expect(v.issues.map((i) => i.code)).toContain("NO_EVIDENCE");
    expect(v.envelope.status).toBe("NEEDS_HUMAN");
  });
  it("keeps an existing MISSING_EVIDENCE handoff and uses the requested role for a new one", () => {
    const v = validateEnvelope(envelope({ findings: [finding({ evidence: [] })] }), context({ handoffRole: "ENGINEER_OF_RECORD" }));
    expect(v.envelope.handoff?.required_role).toBe("ENGINEER_OF_RECORD");
  });
});

describe("rule 6: stale evidence", () => {
  it("caps a vendor email older than 7 days at PROBABLE", () => {
    const old = ref({ kind: "email", trust_tier: "vendor_claim", retrieved_at: "2026-11-10T09:00:00Z", excerpt: "Head at 100 m3/h : 36.1 m." });
    const v = validateEnvelope(envelope({ evidence: [old] }), context());
    expect(v.issues.map((i) => i.code)).toContain("STALE_EVIDENCE");
    expect(v.envelope.confidence.tier).toBe("PROBABLE");
    expect(v.envelope.confidence.reason).toContain("capped");
  });
  it("leaves a fresh email alone", () => {
    const fresh = ref({ kind: "email", trust_tier: "vendor_claim", retrieved_at: "2026-11-25T09:00:00Z" });
    expect(validateEnvelope(envelope({ evidence: [fresh] }), context()).envelope.confidence.tier).toBe("CERTAIN");
  });
  it("treats a quote past expires_at as stale", () => {
    const quote = ref({ kind: "quote", trust_tier: "vendor_claim", expires_at: "2026-11-26T00:00:00Z" });
    expect(validateEnvelope(envelope({ evidence: [quote] }), context()).envelope.confidence.tier).toBe("PROBABLE");
  });
  it("never raises a tier", () => {
    const old = ref({ kind: "email", retrieved_at: "2026-11-01T09:00:00Z" });
    const low = { score: 0.3, method: "heuristic" as const, tier: "POSSIBLE" as const, evidence_coverage: 0.4, reason: "weak" };
    expect(validateEnvelope(envelope({ evidence: [old], confidence: low }), context()).envelope.confidence.tier).toBe("POSSIBLE");
  });
  it("accepts a custom freshness window", () => {
    const e = ref({ kind: "datasheet", retrieved_at: "2026-11-20T09:00:00Z" });
    expect(validateEnvelope(envelope({ evidence: [e] }), context({ freshnessDays: { datasheet: 3 } })).envelope.confidence.tier).toBe("PROBABLE");
  });
});

describe("rule 5: INSUFFICIENT_EVIDENCE is never a recommendation", () => {
  const insufficient = { score: 0.1, method: "evidence_coverage" as const, tier: "INSUFFICIENT_EVIDENCE" as const, evidence_coverage: 0, reason: "no primary source" };
  it("abstains, withdraws verdicts and suggestions, and lists what is missing", () => {
    const v = validateEnvelope(envelope({ confidence: insufficient, next_suggested: [{ specialist: "product_discovery", reason: "try others", input_patch: {} }] }), context());
    expect(v.presentable).toBe(false);
    expect(v.envelope.status).toBe("ABSTAINED");
    expect(v.envelope.next_suggested).toEqual([]);
    expect(v.envelope.findings[0]!.verdict).toBe("UNKNOWN");
    expect(v.missingEvidence.length).toBeGreaterThan(0);
  });
  it("does not make a missing-evidence claim out of an ordinary result", () => {
    expect(validateEnvelope(envelope(), context()).missingEvidence).toEqual([]);
  });
});

describe("parseAndValidate", () => {
  it("reports schema failures as rejects", () => {
    const r = parseAndValidate(ResultSchema, { specialist: "x" }, context());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]!.code).toBe("SCHEMA");
  });
  it("validates a well-formed envelope end to end", () => {
    const r = parseAndValidate(ResultSchema, envelope(), context());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.validated.presentable).toBe(true);
  });
});

describe("entities named inside result", () => {
  const claims = (result: unknown) => [{ subject: { type: "product_config" as const, id: "pl:product_config:made-up" }, refs: ["r1"], path: "result.candidates.0" }, ...(result ? [] : [])];
  it("rejects an invented candidate even when findings and assertions are empty", () => {
    const v = validateEnvelope(envelope({ findings: [] }), context({ resultClaims: claims, resolveEntity: (e) => e.id !== "pl:product_config:made-up" }));
    expect(v.ok).toBe(false);
    expect(v.envelope.status).toBe("ERROR");
    expect(v.issues.find((i) => i.code === "ENTITY_UNRESOLVED")?.path).toBe("result.candidates.0");
  });
  it("downgrades a resolved candidate that cites no verified source", () => {
    const v = validateEnvelope(envelope({ findings: [] }), context({ resultClaims: () => [{ subject: { type: "product_config", id: "pl:product_config:cand-a" }, refs: [] }] }));
    expect(v.issues.map((i) => i.code)).toContain("FINDING_WITHOUT_EVIDENCE");
    expect(v.envelope.status).toBe("NEEDS_HUMAN");
  });
  it("treats a claim whose only source was dropped as unsourced", () => {
    const v = validateEnvelope(envelope({ evidence: [ref({ excerpt: "invented" })] }), context({ resultClaims: () => [{ subject: { type: "product_config", id: "pl:product_config:cand-a" }, refs: ["r1"] }] }));
    expect(v.issues.map((i) => i.code)).toContain("FINDING_WITHOUT_EVIDENCE");
  });
  it("accepts a resolved, sourced candidate", () => {
    const v = validateEnvelope(envelope(), context({ resultClaims: () => [{ subject: { type: "product_config", id: "pl:product_config:cand-a" }, refs: ["r1"] }] }));
    expect(v.issues).toEqual([]);
  });
});
