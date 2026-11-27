import { z } from "zod";
import type { Finding, SourceRef, SpecialistResult } from "../contracts.js";
import type { ValidationContext } from "../validator.js";

export const NOW = new Date("2026-11-27T10:00:00Z");
export const HASH = `sha256:${"a".repeat(64)}`;
export const ResultSchema = z.object({ summary: z.string() }).strict();

export const CURVE_TEXT = "Head at 100 m3/h : 36.1 m.  Efficiency at duty point 74.2 %.\nMotor 15 kW, 460 V, 60 Hz.";

export function ref(over: Partial<SourceRef> = {}): SourceRef {
  return {
    ref_id: "r1",
    kind: "datasheet",
    uri: "sandbox://datasheets/candidate-a.pdf",
    title: "Candidate A data sheet",
    publisher: "Sandbox Pumps",
    retrieved_at: "2026-11-26T09:00:00Z",
    content_hash: HASH,
    locator: { page: 4, row: 12 },
    excerpt: "Head at 100 m3/h : 36.1 m.",
    trust_tier: "primary",
    ...over,
  };
}

export function finding(over: Partial<Finding> = {}): Finding {
  return {
    finding_id: "f1",
    type: "info",
    severity: "INFO",
    code: "PUMP.HEAD.AT_DUTY",
    verdict: "PASS",
    message: "Head at duty meets the requirement",
    subject: { type: "product_config", id: "pl:product_config:cand-a" },
    evidence: ["r1"],
    rule_id: "rule.pump.head_at_duty",
    deterministic: true,
    ...over,
  };
}

export function envelope(over: Partial<SpecialistResult<{ summary: string }>> = {}): SpecialistResult<{ summary: string }> {
  return {
    specialist: "spec_compliance",
    version: "1.0.0",
    run_id: "run_01J9Z8Y7X6W5V4T3S2R1Q0PNMK",
    case_id: "INC-0412",
    idempotency_key: HASH,
    status: "OK",
    result: { summary: "Candidate A meets head at duty" },
    findings: [finding()],
    confidence: { score: 0.93, method: "deterministic", tier: "CERTAIN", evidence_coverage: 1, reason: "curve interpolated inside tested range" },
    evidence: [ref()],
    handoff: null,
    next_suggested: [],
    assumptions: ["water at 7 C"],
    input_versions: { requirement_rev: "C", config_rev: "1" },
    generated_at: NOW.toISOString(),
    model_usage: [{ model: "test-model", tokens_in: 100, tokens_out: 50, usd: 0.001, ms: 420 }],
    assertions: [],
    ...over,
  };
}

export function context(over: Partial<ValidationContext> = {}): ValidationContext {
  return {
    now: NOW,
    sourceText: () => CURVE_TEXT,
    resolveEntity: () => true,
    ...over,
  };
}
