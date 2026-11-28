/*
 * EquipmentModule seam. Core infrastructure talks only to this interface; pumps are the first module,
 * an AHU fan or switchgear module implements the same contract without touching the kernel.
 */

export type Operator = "EQ" | "NE" | "GTE" | "GT" | "LTE" | "LT" | "IN";
export type Verdict = "PASS" | "FAIL" | "UNKNOWN" | "NOT_APPLICABLE";

export interface Predicate {
  field: string;
  operator: Operator;
  value: number | string | Array<number | string>;
  unit?: string;
}

export interface Criterion {
  id: string;
  predicate: Predicate;
  mandatory: boolean;
  evidence_needed: string;
  basis?: string;
  source_refs: string[];
}

export interface RequirementSet {
  id: string;
  revision: number;
  package_id: string;
  duty_point: Record<string, unknown>;
  criteria: Criterion[];
  open_criteria?: Array<{ id: string; evidence_needed: string }>;
}

/** Where a measured value came from, precise enough to cite. */
export interface ValueSource {
  /** Evidence source id from the reference data (e.g. "bg-e1510-curve"). */
  source_id: string;
  /** Verbatim transcription lines the value was read or interpolated from. */
  excerpts: string[];
  /** True when the value was computed (interpolated, converted) rather than read off directly. */
  derived: boolean;
  method: string;
}

export type Resolved =
  | { known: true; value: number | string; unit?: string; error_band?: number; source: ValueSource }
  | { known: false; reason: string; missing: string };

export interface CheckResult {
  criterion_id: string;
  field: string;
  mandatory: boolean;
  verdict: Verdict;
  required: { operator: Operator; value: Predicate["value"]; unit?: string };
  measured?: { value: number | string; unit?: string };
  /** measured − required in the requirement's unit, signed so that positive means compliant. */
  margin?: number;
  /** Reading or extraction uncertainty in the requirement's unit. */
  error_band?: number;
  reason: string;
  source?: ValueSource;
  /** Present when the verdict is UNKNOWN: what evidence would settle it. */
  missing?: string;
  /** Stable rule id for audit, e.g. "pump.head_at_duty". */
  rule_id: string;
}

export interface EquipmentModule<Config> {
  readonly kind: string;
  readonly version: string;
  /** Fields this module can resolve from a configuration. A criterion on any other field is UNKNOWN. */
  readonly fields: readonly string[];
  resolve(config: Config, field: string, duty: Record<string, unknown>): Resolved;
  evaluate(requirements: RequirementSet, config: Config): CheckResult[];
}
