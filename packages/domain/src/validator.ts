import type { z } from "zod";
import { specialistResultSchema, type ConfidenceTier, type EntityRef, type SourceKind, type SourceRef, type SpecialistResult } from "./contracts.js";

/*
 * Envelope-level rules, docs/03 section 3. Enforced in code, never in a prompt.
 *
 *   1 No source, no claim            -> NEEDS_HUMAN
 *   2 No invention                   -> reject
 *   3 Verbatim excerpts              -> drop the ref, downgrade
 *   4 Confidence and severity are independent (nothing couples them here)
 *   5 INSUFFICIENT_EVIDENCE is never a recommendation
 *   6 Stale evidence caps tier at PROBABLE
 *   7 Idempotent replay              -> idempotency.ts
 */

export interface ValidationContext {
  now: Date;
  /** Text of the block a ref points at. Return undefined when it cannot be loaded: the check then fails closed. */
  sourceText(ref: SourceRef): string | undefined;
  /** True when the identity exists in a seeded catalog, a fetched public source or a project document. */
  resolveEntity(ref: EntityRef): boolean;
  /**
   * Entities a specialist names inside its own `result` (for example discovery candidates), with the evidence that
   * supports each. The validator cannot read a specialist's result shape, so the specialist supplies this.
   * Each claim is held to the same rules as a finding subject: it must resolve, and it must cite a verified source.
   */
  resultClaims?(result: unknown): Array<{ subject: EntityRef; refs: string[]; path?: string }>;
  /** Per-kind freshness windows in days, merged over the defaults. */
  freshnessDays?: Partial<Record<SourceKind, number>>;
  /** Role asked to resolve a missing-evidence handoff that the validator has to create. */
  handoffRole?: "ENGINEER_OF_RECORD" | "PROCUREMENT_MANAGER" | "PROJECT_MANAGER";
}

/** A vendor commitment is stale after 7 days. Quotes use their own `expires_at`. */
export const DEFAULT_FRESHNESS_DAYS: Partial<Record<SourceKind, number>> = { email: 7 };

export type IssueCode =
  | "SCHEMA"
  | "SOURCE_UNAVAILABLE"
  | "EXCERPT_NOT_FOUND"
  | "ENTITY_UNRESOLVED"
  | "IDENTITY_FROM_DERIVED"
  | "FINDING_WITHOUT_EVIDENCE"
  | "NO_EVIDENCE"
  | "STALE_EVIDENCE"
  | "INSUFFICIENT_EVIDENCE";

export interface Issue {
  code: IssueCode;
  /** reject: result unusable. downgrade: usable but weakened. drop: a claim or ref was removed. */
  severity: "reject" | "downgrade" | "drop";
  message: string;
  path?: string;
}

export interface Validated<T> {
  ok: boolean;
  envelope: SpecialistResult<T>;
  issues: Issue[];
  /** What a human should be asked for instead of a recommendation. */
  missingEvidence: string[];
  /** False when nothing here may be shown as a recommendation (rule 5, or a rejected result). */
  presentable: boolean;
}

const TIER_ORDER: ConfidenceTier[] = ["INSUFFICIENT_EVIDENCE", "POSSIBLE", "PROBABLE", "CERTAIN"];
const capTier = (tier: ConfidenceTier, cap: ConfidenceTier): ConfidenceTier => (TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(cap) ? cap : tier);
const IDENTITY_TYPES = new Set(["vendor", "product_config"]);

export function normalizeText(s: string): string {
  return s.normalize("NFKC").replace(/\s+/g, " ").trim();
}

const DAY_MS = 86_400_000;

export function validateEnvelope<T>(input: SpecialistResult<T>, ctx: ValidationContext): Validated<T> {
  const env = structuredClone(input);
  const issues: Issue[] = [];
  const missing: string[] = [];
  let downgraded = false;
  let tier = env.confidence.tier;

  /* Rule 3: verbatim excerpts. Ref that fail are dropped and everything that cited them is weakened. */
  const dropped = new Set<string>();
  for (const ref of env.evidence) {
    if (ref.kind === "derived") continue;
    const text = ctx.sourceText(ref);
    if (text === undefined) {
      dropped.add(ref.ref_id);
      issues.push({ code: "SOURCE_UNAVAILABLE", severity: "drop", message: `source for ${ref.ref_id} could not be loaded, so its excerpt cannot be verified`, path: `evidence.${ref.ref_id}` });
    } else if (!normalizeText(text).includes(normalizeText(ref.excerpt))) {
      dropped.add(ref.ref_id);
      issues.push({ code: "EXCERPT_NOT_FOUND", severity: "drop", message: `excerpt for ${ref.ref_id} is not in the cited block`, path: `evidence.${ref.ref_id}` });
    }
  }
  if (dropped.size) {
    downgraded = true;
    env.evidence = env.evidence.filter((r) => !dropped.has(r.ref_id));
    const strip = (refs: string[]) => refs.filter((id) => !dropped.has(id));
    for (const f of env.findings) {
      const had = f.evidence.length > 0;
      f.evidence = strip(f.evidence);
      if (had && f.evidence.length === 0 && f.verdict && f.verdict !== "NOT_APPLICABLE") f.verdict = "UNKNOWN";
    }
    for (const a of env.assertions) a.refs = strip(a.refs);
    env.assertions = env.assertions.filter((a) => a.refs.length > 0);
    if (env.handoff) env.handoff.context_refs = strip(env.handoff.context_refs);
    tier = capTier(tier, "POSSIBLE");
  }

  /* Rule 2: no invention. */
  const byId = new Map(env.evidence.map((r) => [r.ref_id, r]));
  const subjects: Array<{ ref: EntityRef; refs: string[]; path: string }> = [
    ...env.findings.map((f, i) => ({ ref: f.subject, refs: f.evidence, path: `findings.${i}.subject` })),
    ...env.assertions.flatMap((a, i) => (a.subject ? [{ ref: a.subject, refs: a.refs, path: `assertions.${i}.subject` }] : [])),
    ...(ctx.resultClaims?.(env.result) ?? []).map((c, i) => ({ ref: c.subject, refs: c.refs.filter((id) => !dropped.has(id)), path: c.path ?? `result.claims.${i}` })),
  ];
  for (const s of subjects) {
    if (!ctx.resolveEntity(s.ref)) issues.push({ code: "ENTITY_UNRESOLVED", severity: "reject", message: `${s.ref.id} does not resolve to a catalog record, public source or project document`, path: s.path });
    else if (IDENTITY_TYPES.has(s.ref.type) && s.refs.length > 0 && s.refs.every((id) => byId.get(id)?.trust_tier === "derived"))
      issues.push({ code: "IDENTITY_FROM_DERIVED", severity: "reject", message: `identity ${s.ref.id} is supported only by derived values`, path: s.path });
  }

  /* Rule 1: no source, no claim. */
  env.findings.forEach((f, i) => {
    const claims = f.verdict !== undefined || f.severity !== "INFO";
    if (claims && f.evidence.length === 0) {
      downgraded = true;
      issues.push({ code: "FINDING_WITHOUT_EVIDENCE", severity: "downgrade", message: `finding ${f.finding_id} has no source`, path: `findings.${i}` });
      missing.push(`Source for ${f.code}: ${f.message}`);
      if (f.verdict && f.verdict !== "NOT_APPLICABLE") f.verdict = "UNKNOWN";
    }
  });
  for (const c of ctx.resultClaims?.(env.result) ?? []) {
    const live = c.refs.filter((id) => byId.has(id));
    if (live.length === 0) {
      downgraded = true;
      issues.push({ code: "FINDING_WITHOUT_EVIDENCE", severity: "downgrade", message: `${c.subject.id} is named in the result without a verified source`, path: c.path });
      missing.push(`Source for ${c.subject.id}`);
    }
  }
  if ((env.status === "OK" || env.status === "PARTIAL") && env.evidence.length === 0) {
    downgraded = true;
    issues.push({ code: "NO_EVIDENCE", severity: "downgrade", message: "the result cites no evidence at all" });
    if (missing.length === 0) missing.push("Any source document for this result");
    tier = "INSUFFICIENT_EVIDENCE";
  }

  /** Claims that lack a source force a handoff. The list rule 5 builds below does not: an abstention stays an abstention. */
  const unsourced = missing.length;

  /* Rule 6: stale evidence caps the tier. */
  const windows = { ...DEFAULT_FRESHNESS_DAYS, ...ctx.freshnessDays };
  for (const ref of env.evidence) {
    const days = windows[ref.kind];
    const age = ctx.now.getTime() - Date.parse(ref.retrieved_at);
    const expired = ref.expires_at !== undefined && ctx.now.getTime() > Date.parse(ref.expires_at);
    if (expired || (days !== undefined && age > days * DAY_MS)) {
      issues.push({ code: "STALE_EVIDENCE", severity: "downgrade", message: expired ? `${ref.ref_id} expired at ${ref.expires_at}` : `${ref.ref_id} is older than ${days} days`, path: `evidence.${ref.ref_id}` });
      tier = capTier(tier, "PROBABLE");
    }
  }

  const rejected = issues.some((i) => i.severity === "reject");

  /* Rule 5: INSUFFICIENT_EVIDENCE is a list of what is missing, not a recommendation. */
  const insufficient = tier === "INSUFFICIENT_EVIDENCE";
  if (insufficient) {
    issues.push({ code: "INSUFFICIENT_EVIDENCE", severity: "downgrade", message: "evidence is insufficient: shown only as a missing-evidence list" });
    env.next_suggested = [];
    for (const f of env.findings) if (f.verdict === "PASS" || f.verdict === "FAIL") f.verdict = "UNKNOWN";
    if (missing.length === 0) missing.push(...env.assumptions.map((a) => `Confirm assumption: ${a}`), "Evidence that satisfies the required facts");
  }

  env.confidence = {
    ...env.confidence,
    tier,
    reason: tier === input.confidence.tier ? env.confidence.reason : `${env.confidence.reason} (tier capped by validator: ${[...new Set(issues.map((i) => i.code))].join(", ")})`,
  };

  if (rejected) env.status = "ERROR";
  else if (unsourced > 0 && env.status !== "ERROR") {
    env.status = "NEEDS_HUMAN";
    if (!env.handoff || env.handoff.reason_code !== "MISSING_EVIDENCE") {
      env.handoff = {
        reason_code: "MISSING_EVIDENCE",
        question: `Provide the missing evidence: ${missing.join("; ")}`,
        options: [
          { id: "provide_evidence", label: "Provide the missing source", effect: "The specialist is re-run with the new source" },
          { id: "accept_unknown", label: "Proceed with the items marked UNKNOWN", effect: "The affected claims stay UNKNOWN and block anything binding" },
        ],
        required_role: ctx.handoffRole ?? "PROCUREMENT_MANAGER",
        due_by: new Date(ctx.now.getTime() + DAY_MS).toISOString(),
        blocking: true,
        context_refs: env.evidence.map((r) => r.ref_id),
      };
    }
  } else if (insufficient && env.status !== "NEEDS_HUMAN" && env.status !== "ERROR") env.status = "ABSTAINED";
  else if (downgraded && env.status === "OK") env.status = "PARTIAL";

  return { ok: !rejected, envelope: env, issues, missingEvidence: missing, presentable: !rejected && !insufficient };
}

/** Parse untrusted output against the specialist's schema, then apply the evidence rules. */
export function parseAndValidate<S extends z.ZodTypeAny>(
  resultSchema: S,
  raw: unknown,
  ctx: ValidationContext,
): { ok: true; validated: Validated<z.output<S>> } | { ok: false; issues: Issue[] } {
  const parsed = specialistResultSchema(resultSchema).safeParse(raw);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((i) => ({ code: "SCHEMA", severity: "reject", message: i.message, path: i.path.join(".") })) };
  return { ok: true, validated: validateEnvelope(parsed.data, ctx) };
}
