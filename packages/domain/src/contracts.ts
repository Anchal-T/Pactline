import { z } from "zod";

/*
 * Shared specialist contract, docs/03 section 3. Every L2 specialist returns SpecialistResult<T>.
 * Cross-reference rules live here (schema level); evidence rules that need a source loader live in validator.ts.
 */

const iso = z.string().datetime({ offset: true });
const isJson = (v: unknown): boolean => {
  try {
    return JSON.stringify(v) !== undefined;
  } catch {
    return false;
  }
};

/* ------------------------------------------------------------------ */
/* SourceRef                                                           */
/* ------------------------------------------------------------------ */

export const SOURCE_KINDS = [
  "spec_section",
  "submittal",
  "datasheet",
  "curve",
  "quote",
  "po",
  "email",
  "public_registry",
  "market_report",
  "price_index",
  "standard",
  "photo",
  "derived",
] as const;
export const SourceKindSchema = z.enum(SOURCE_KINDS);
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const TRUST_TIERS = ["primary", "secondary", "vendor_claim", "derived", "synthetic"] as const;
export const TrustTierSchema = z.enum(TRUST_TIERS);
export type TrustTier = z.infer<typeof TrustTierSchema>;

export const LocatorSchema = z
  .object({
    page: z.number().int().positive().optional(),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    section: z.string().min(1).optional(),
    row: z.number().int().nonnegative().optional(),
    json_path: z.string().min(1).optional(),
  })
  .strict()
  .refine((l) => !l.bbox || (l.bbox[0] <= l.bbox[2] && l.bbox[1] <= l.bbox[3]), { message: "bbox must be [x0, y0, x1, y1] with x0 <= x1 and y0 <= y1", path: ["bbox"] });
export type Locator = z.infer<typeof LocatorSchema>;

export const EXCERPT_MAX = 300;

export const SourceRefSchema = z
  .object({
    ref_id: z.string().min(1),
    kind: SourceKindSchema,
    uri: z.string().min(1),
    title: z.string().min(1),
    publisher: z.string().min(1).optional(),
    retrieved_at: iso,
    /** Absent only for `derived` refs, which point at a computation rather than a document. */
    content_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/, "content_hash must be sha256:<64 hex>").optional(),
    locator: LocatorSchema,
    /** Verbatim text from the cited block, validated by the envelope validator. */
    excerpt: z.string().max(EXCERPT_MAX),
    trust_tier: TrustTierSchema,
    /** Optional extension: a quote's validity end. Past this the evidence is stale. */
    expires_at: iso.optional(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.kind !== "derived" && !r.content_hash) ctx.addIssue({ code: "custom", path: ["content_hash"], message: "content_hash is required unless kind is derived" });
    if (r.kind !== "derived" && r.excerpt.trim() === "") ctx.addIssue({ code: "custom", path: ["excerpt"], message: "a non-derived source needs a verbatim excerpt" });
    if (r.kind === "derived" && r.trust_tier !== "derived") ctx.addIssue({ code: "custom", path: ["trust_tier"], message: "a derived ref must have trust_tier derived" });
  });
export type SourceRef = z.infer<typeof SourceRefSchema>;

/* ------------------------------------------------------------------ */
/* Confidence                                                          */
/* ------------------------------------------------------------------ */

export const CONFIDENCE_TIERS = ["CERTAIN", "PROBABLE", "POSSIBLE", "INSUFFICIENT_EVIDENCE"] as const;
export const ConfidenceTierSchema = z.enum(CONFIDENCE_TIERS);
export type ConfidenceTier = z.infer<typeof ConfidenceTierSchema>;

export const ConfidenceSchema = z
  .object({
    score: z.number().min(0).max(1),
    method: z.enum(["deterministic", "conformal", "agreement", "evidence_coverage", "heuristic"]),
    tier: ConfidenceTierSchema,
    interval: z
      .object({ lo: z.number(), hi: z.number(), unit: z.string().min(1), coverage: z.number().gt(0).lt(1) })
      .strict()
      .refine((i) => i.lo <= i.hi, { message: "interval.lo must not exceed interval.hi" })
      .optional(),
    /** Share of required facts that have at least one primary SourceRef. */
    evidence_coverage: z.number().min(0).max(1),
    reason: z.string().min(1),
    calibration_ref: z.string().min(1).optional(),
  })
  .strict();
export type Confidence = z.infer<typeof ConfidenceSchema>;

/* ------------------------------------------------------------------ */
/* EntityRef                                                           */
/* ------------------------------------------------------------------ */

export const ENTITY_TYPES = ["vendor", "product_config", "po_line", "submittal", "activity", "spec_section"] as const;
export const EntityTypeSchema = z.enum(ENTITY_TYPES);
export type EntityType = z.infer<typeof EntityTypeSchema>;

export const EntityRefSchema = z
  .object({
    type: EntityTypeSchema,
    id: z.string().regex(/^pl:[a-z_]+:[A-Za-z0-9._~-]+$/, "entity id must look like pl:<type>:<id>"),
    external_ids: z
      .object({
        gstin: z.string().optional(),
        cin: z.string().optional(),
        sam_uei: z.string().optional(),
        mfr_model: z.string().optional(),
        erp_po: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((e) => e.id.startsWith(`pl:${e.type}:`), { message: "entity id prefix must match its type", path: ["id"] });
export type EntityRef = z.infer<typeof EntityRefSchema>;

/* ------------------------------------------------------------------ */
/* Finding                                                             */
/* ------------------------------------------------------------------ */

export const SEVERITIES = ["BLOCKER", "MAJOR", "MINOR", "INFO"] as const;
export const SeveritySchema = z.enum(SEVERITIES);
export type Severity = z.infer<typeof SeveritySchema>;

export const VERDICTS = ["PASS", "FAIL", "UNKNOWN", "NOT_APPLICABLE"] as const;
export const VerdictSchema = z.enum(VERDICTS);
export type Verdict = z.infer<typeof VerdictSchema>;

export const QuantitySchema = z.object({ value: z.number().finite(), unit: z.string().min(1) }).strict();
const Measure = z.union([QuantitySchema, z.number().finite(), z.string()]);

export const FindingSchema = z
  .object({
    finding_id: z.string().min(1),
    type: z.enum(["noncompliance", "risk", "scope_gap", "exclusion", "anomaly", "conflict", "info"]),
    severity: SeveritySchema,
    /** Dotted, upper-case, e.g. PUMP.HEAD.BELOW_DUTY */
    code: z.string().regex(/^[A-Z][A-Z0-9_]*(\.[A-Z0-9_]+)+$/, "code must look like AREA.CHECK.REASON"),
    verdict: VerdictSchema.optional(),
    message: z.string().min(1),
    subject: EntityRefSchema,
    measured: Measure.optional(),
    required: Measure.optional(),
    margin: Measure.optional(),
    /** ref_ids into the envelope's evidence list */
    evidence: z.array(z.string().min(1)),
    rule_id: z.string().min(1),
    deterministic: z.boolean(),
  })
  .strict();
export type Finding = z.infer<typeof FindingSchema>;

/* ------------------------------------------------------------------ */
/* HumanHandoff                                                        */
/* ------------------------------------------------------------------ */

export const HANDOFF_REASONS = ["LOW_CONFIDENCE", "MISSING_EVIDENCE", "CONFLICTING_SOURCES", "POLICY_THRESHOLD", "OUT_OF_DOMAIN", "INJECTION_SUSPECTED"] as const;
export const HANDOFF_ROLES = ["ENGINEER_OF_RECORD", "PROCUREMENT_MANAGER", "PROJECT_MANAGER"] as const;

export const HumanHandoffSchema = z
  .object({
    reason_code: z.enum(HANDOFF_REASONS),
    question: z.string().min(1),
    options: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), effect: z.string().min(1) }).strict()).min(1),
    required_role: z.enum(HANDOFF_ROLES),
    due_by: iso,
    blocking: z.boolean(),
    context_refs: z.array(z.string().min(1)),
  })
  .strict();
export type HumanHandoff = z.infer<typeof HumanHandoffSchema>;

/* ------------------------------------------------------------------ */
/* StatePin, Assertion, usage                                          */
/* ------------------------------------------------------------------ */

/** Revisions a result was computed against. A result whose pin has drifted is kept for audit, never executed. */
export const StatePinSchema = z
  .object({
    requirement_rev: z.string().min(1).optional(),
    config_rev: z.string().min(1).optional(),
    schedule_rev: z.string().min(1).optional(),
    offer_rev: z.string().min(1).optional(),
    plan_rev: z.string().min(1).optional(),
  })
  .catchall(z.union([z.string(), z.number()]));
export type StatePin = z.infer<typeof StatePinSchema>;

/** A typed claim the Conflict Detector joins on `claim_key`. */
export const AssertionSchema = z
  .object({
    claim_key: z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_:-]+)+$/i, "claim_key must be dotted, e.g. vendor.pl:vendor:acme.debarred"),
    value: z.unknown().refine(isJson, "assertion value must be JSON-serialisable"),
    confidence: ConfidenceSchema,
    refs: z.array(z.string().min(1)).min(1),
    subject: EntityRefSchema.optional(),
  })
  .strict();
export type Assertion = z.infer<typeof AssertionSchema>;

export const ModelUsageSchema = z
  .object({ model: z.string().min(1), tokens_in: z.number().int().nonnegative(), tokens_out: z.number().int().nonnegative(), usd: z.number().nonnegative(), ms: z.number().nonnegative() })
  .strict();
export type ModelUsage = z.infer<typeof ModelUsageSchema>;

/* ------------------------------------------------------------------ */
/* SpecialistResult<T>                                                 */
/* ------------------------------------------------------------------ */

export const STATUSES = ["OK", "PARTIAL", "ABSTAINED", "NEEDS_HUMAN", "ERROR"] as const;
export const StatusSchema = z.enum(STATUSES);
export type Status = z.infer<typeof StatusSchema>;

const ULID = /^run_[0-9A-HJKMNP-TV-Z]{26}$/;
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function envelopeShape<T extends z.ZodTypeAny>(result: T) {
  return {
    specialist: z.string().regex(/^[a-z][a-z0-9_]*$/, "specialist id must be snake_case"),
    version: z.string().regex(SEMVER),
    run_id: z.string().regex(ULID, "run_id must be run_<ULID>"),
    case_id: z.string().min(1).nullable(),
    idempotency_key: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    status: StatusSchema,
    result,
    findings: z.array(FindingSchema),
    confidence: ConfidenceSchema,
    evidence: z.array(SourceRefSchema),
    handoff: HumanHandoffSchema.nullable(),
    next_suggested: z.array(z.object({ specialist: z.string().min(1), reason: z.string().min(1), input_patch: z.record(z.unknown()) }).strict()),
    assumptions: z.array(z.string().min(1)),
    input_versions: StatePinSchema,
    generated_at: iso,
    model_usage: z.array(ModelUsageSchema),
    /** Extension: typed claims for the Conflict Detector (docs/03 section 6). */
    assertions: z.array(AssertionSchema).default([]),
  };
}

const baseEnvelope = z.object(envelopeShape(z.unknown())).strict();
type EnvelopeBase = z.infer<typeof baseEnvelope>;
export type SpecialistResult<T = unknown> = Omit<EnvelopeBase, "result"> & { result: T };

/** The raw field shape, for registries that wrap it themselves (the MCP SDK takes a shape). */
export function specialistEnvelopeShape<T extends z.ZodTypeAny>(result: T) {
  return envelopeShape(result);
}

/** Cross-references and status rules that hold for any envelope, regardless of source loading. */
export function specialistResultSchema<T extends z.ZodTypeAny>(result: T): z.ZodType<SpecialistResult<z.output<T>>, z.ZodTypeDef, unknown> {
  return z
    .object(envelopeShape(result))
    .strict()
    .superRefine((env, ctx) => {
      const ids = new Set<string>();
      env.evidence.forEach((r, i) => {
        if (ids.has(r.ref_id)) ctx.addIssue({ code: "custom", path: ["evidence", i, "ref_id"], message: `duplicate ref_id ${r.ref_id}` });
        ids.add(r.ref_id);
      });
      const check = (refs: string[], path: Array<string | number>) =>
        refs.forEach((id, j) => {
          if (!ids.has(id)) ctx.addIssue({ code: "custom", path: [...path, j], message: `ref_id ${id} is not in evidence` });
        });
      env.findings.forEach((f, i) => check(f.evidence, ["findings", i, "evidence"]));
      env.assertions.forEach((a, i) => check(a.refs, ["assertions", i, "refs"]));
      if (env.handoff) check(env.handoff.context_refs, ["handoff", "context_refs"]);
      if (env.status === "NEEDS_HUMAN" && !env.handoff) ctx.addIssue({ code: "custom", path: ["handoff"], message: "NEEDS_HUMAN requires a handoff" });
      if (env.status === "OK" && env.handoff?.blocking) ctx.addIssue({ code: "custom", path: ["status"], message: "a blocking handoff cannot accompany status OK" });
    }) as unknown as z.ZodType<SpecialistResult<z.output<T>>, z.ZodTypeDef, unknown>;
}
