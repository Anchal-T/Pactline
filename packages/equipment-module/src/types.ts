import type {
  ComplianceFindingResult,
  ProductConfigId,
  RequirementId,
  RequirementSetId,
} from "@pactline/domain";

/** Where a requirement was stated, so every finding is traceable to the spec. */
export interface RequirementSource {
  readonly document: string;
  readonly section: string;
}

export interface RequirementBase {
  readonly id: RequirementId;
  readonly mandatory: boolean;
  readonly source: RequirementSource;
  /** The requirement only applies when this configuration attribute equals the value. */
  readonly appliesWhen?: { readonly property: string; readonly equals: AttributeValue };
}

export type AttributeValue = number | string | boolean;

/** A single evidenced fact about a configuration, e.g. a datasheet value. */
export interface Attribute {
  readonly value: AttributeValue;
  readonly unit?: string;
  readonly evidenceRef: string;
}

export type Attributes = Readonly<Record<string, Attribute>>;

export type NumericComparison =
  | { readonly op: "GTE"; readonly value: number }
  | { readonly op: "LTE"; readonly value: number }
  | { readonly op: "EQ"; readonly value: number }
  | { readonly op: "RANGE"; readonly min: number; readonly max: number };

export interface NumericRequirement extends RequirementBase {
  readonly kind: "NUMERIC";
  readonly property: string;
  /** Evidence must state the same unit; no implicit conversion. */
  readonly unit: string;
  readonly comparison: NumericComparison;
}

export interface StringMatchRequirement extends RequirementBase {
  readonly kind: "STRING_MATCH";
  readonly property: string;
  /** Accepted values, compared case-insensitively after trimming. */
  readonly oneOf: readonly string[];
}

export interface BooleanRequirement extends RequirementBase {
  readonly kind: "BOOLEAN";
  readonly property: string;
  readonly expected: boolean;
}

export type GenericRequirement = NumericRequirement | StringMatchRequirement | BooleanRequirement;

export interface RequirementSet<TRequirement> {
  readonly id: RequirementSetId;
  readonly revision: number;
  readonly requirements: readonly TRequirement[];
}

export interface ComplianceFinding {
  readonly requirementId: RequirementId;
  readonly mandatory: boolean;
  readonly result: ComplianceFindingResult;
  readonly explanation: string;
  /** Evidence the result rests on. Empty only when the result is UNKNOWN for lack of evidence. */
  readonly evidenceRefs: readonly string[];
  /** The evaluated quantity (e.g. interpolated head), when one was computed. */
  readonly observed?: AttributeValue;
  readonly source: RequirementSource;
}

/**
 * NON_COMPLIANT: a mandatory requirement FAILs (blocks standard substitution).
 * INCOMPLETE: no mandatory FAIL, but a mandatory requirement is UNKNOWN.
 * COMPLIANT: every mandatory requirement PASSes or is NOT_APPLICABLE. Not engineering approval.
 */
export type ComplianceStatus = "COMPLIANT" | "INCOMPLETE" | "NON_COMPLIANT";

export interface ComplianceReport {
  readonly configurationId: ProductConfigId;
  readonly requirementSetId: RequirementSetId;
  readonly requirementSetRevision: number;
  readonly evaluatorVersion: string;
  readonly status: ComplianceStatus;
  readonly findings: readonly ComplianceFinding[];
}

/** The seam each equipment category implements; core code depends only on this. */
export interface EquipmentModule<TConfiguration, TRequirement> {
  readonly equipmentType: string;
  readonly evaluatorVersion: string;
  evaluate(requirementSet: RequirementSet<TRequirement>, configuration: TConfiguration): ComplianceReport;
}

/** Outcome of one predicate before requirement metadata is attached. */
export interface Verdict {
  readonly result: ComplianceFindingResult;
  readonly explanation: string;
  readonly evidenceRefs: readonly string[];
  readonly observed?: AttributeValue;
}
