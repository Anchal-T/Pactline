import type {
  Attribute,
  Attributes,
  ComplianceFinding,
  ComplianceStatus,
  GenericRequirement,
  NumericComparison,
  RequirementBase,
  Verdict,
} from "./types.js";

/** Absorbs floating-point noise (e.g. 35 * 0.98) without loosening real limits. */
export const EPSILON = 1e-9;

export const unknown = (explanation: string, evidenceRefs: readonly string[] = []): Verdict => ({
  result: "UNKNOWN",
  explanation,
  evidenceRefs,
});

export const round = (value: number, digits = 3): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** True when a source reference is present; guards untyped (JSON) input too. */
export const hasRef = (evidenceRef: string | undefined): evidenceRef is string =>
  typeof evidenceRef === "string" && evidenceRef.trim() !== "";

/**
 * A malformed requirement threshold must not turn into FAIL (NaN comparisons are false),
 * so it is reported as UNKNOWN for the requirement author to fix.
 */
export function invalidThreshold(values: Readonly<Record<string, number>>): Verdict | undefined {
  const bad = Object.entries(values).filter(([, value]) => !Number.isFinite(value));
  return bad.length > 0
    ? unknown(`Requirement has a non-numeric ${bad.map(([name]) => name).join(", ")}`)
    : undefined;
}

/** An attribute only counts as evidence when it carries a source reference. */
function evidenced(attributes: Attributes, property: string): Attribute | undefined {
  const attribute = attributes[property];
  return attribute && hasRef(attribute.evidenceRef) ? attribute : undefined;
}

export function evaluateGeneric(requirement: GenericRequirement, attributes: Attributes): Verdict {
  const attribute = evidenced(attributes, requirement.property);
  if (!attribute) return unknown(`No evidenced value for "${requirement.property}"`);
  const refs = [attribute.evidenceRef];

  switch (requirement.kind) {
    case "NUMERIC": {
      const { value, unit } = attribute;
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return unknown(`"${requirement.property}" is not a finite number`, refs);
      }
      const { comparison } = requirement;
      const invalid = invalidThreshold(
        comparison.op === "RANGE" ? { min: comparison.min, max: comparison.max } : { value: comparison.value },
      );
      if (invalid) return invalid;
      if (unit !== requirement.unit) {
        return unknown(`"${requirement.property}" is stated in ${unit ?? "no unit"}, requirement uses ${requirement.unit}`, refs);
      }
      const pass = compare(value, requirement.comparison);
      return {
        result: pass ? "PASS" : "FAIL",
        explanation: `${requirement.property} = ${value} ${unit}; required ${describe(requirement.comparison)} ${unit}`,
        evidenceRefs: refs,
        observed: value,
      };
    }
    case "STRING_MATCH": {
      if (typeof attribute.value !== "string") {
        return unknown(`"${requirement.property}" is not text`, refs);
      }
      const actual = normalize(attribute.value);
      const pass = requirement.oneOf.some((accepted) => normalize(accepted) === actual);
      return {
        result: pass ? "PASS" : "FAIL",
        explanation: `${requirement.property} = "${attribute.value}"; accepted: ${requirement.oneOf.join(", ")}`,
        evidenceRefs: refs,
        observed: attribute.value,
      };
    }
    case "BOOLEAN": {
      if (typeof attribute.value !== "boolean") {
        return unknown(`"${requirement.property}" is not a yes/no value`, refs);
      }
      return {
        result: attribute.value === requirement.expected ? "PASS" : "FAIL",
        explanation: `${requirement.property} = ${attribute.value}; required ${requirement.expected}`,
        evidenceRefs: refs,
        observed: attribute.value,
      };
    }
  }
}

/**
 * Runs `evaluate` only when the requirement applies to this configuration.
 * Applicability that cannot be determined from evidence is UNKNOWN, not NOT_APPLICABLE.
 */
export function toFinding(
  requirement: RequirementBase,
  attributes: Attributes,
  evaluate: () => Verdict,
): ComplianceFinding {
  const base = { requirementId: requirement.id, mandatory: requirement.mandatory, source: requirement.source };
  const condition = requirement.appliesWhen;
  if (condition) {
    const attribute = evidenced(attributes, condition.property);
    if (!attribute) {
      return { ...base, ...unknown(`Cannot tell whether this applies: no evidenced "${condition.property}"`) };
    }
    if (!sameValue(attribute.value, condition.equals)) {
      return {
        ...base,
        result: "NOT_APPLICABLE",
        explanation: `Applies only when ${condition.property} = ${String(condition.equals)}; configuration has ${String(attribute.value)}`,
        evidenceRefs: [attribute.evidenceRef],
      };
    }
  }
  return { ...base, ...evaluate() };
}

export function overallStatus(findings: readonly ComplianceFinding[]): ComplianceStatus {
  const mandatory = findings.filter((finding) => finding.mandatory);
  if (mandatory.some((finding) => finding.result === "FAIL")) return "NON_COMPLIANT";
  if (mandatory.some((finding) => finding.result === "UNKNOWN")) return "INCOMPLETE";
  return "COMPLIANT";
}

function compare(value: number, comparison: NumericComparison): boolean {
  switch (comparison.op) {
    case "GTE":
      return value >= comparison.value - EPSILON;
    case "LTE":
      return value <= comparison.value + EPSILON;
    case "EQ":
      return Math.abs(value - comparison.value) <= EPSILON;
    case "RANGE":
      return value >= comparison.min - EPSILON && value <= comparison.max + EPSILON;
  }
}

function describe(comparison: NumericComparison): string {
  switch (comparison.op) {
    case "GTE":
      return `≥ ${comparison.value}`;
    case "LTE":
      return `≤ ${comparison.value}`;
    case "EQ":
      return `= ${comparison.value}`;
    case "RANGE":
      return `${comparison.min}–${comparison.max}`;
  }
}

function sameValue(actual: Attribute["value"], expected: Attribute["value"]): boolean {
  return typeof actual === "string" && typeof expected === "string"
    ? normalize(actual) === normalize(expected)
    : actual === expected;
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}
