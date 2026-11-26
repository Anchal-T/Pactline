// CentrifugalPumpModule: evaluates an exact pump configuration against typed requirements.
// Missing, inconsistent or out-of-range evidence is UNKNOWN, never PASS.
import type { ProductConfigId } from "@pactline/domain";
import {
  EPSILON,
  evaluateGeneric,
  hasRef,
  invalidThreshold,
  overallStatus,
  round,
  toFinding,
  unknown,
} from "../evaluate.js";
import type {
  Attributes,
  ComplianceReport,
  EquipmentModule,
  GenericRequirement,
  RequirementBase,
  RequirementSet,
  Verdict,
} from "../types.js";
import { type PumpCurve, type ValidatedCurve, interpolate, isPercent, validateCurve } from "./curve.js";

export type { CurveConditions, CurvePoint, PumpCurve } from "./curve.js";

export const EFFICIENCY_CLASSES = ["IE1", "IE2", "IE3", "IE4", "IE5"] as const;
export type EfficiencyClass = (typeof EFFICIENCY_CLASSES)[number];

/** Motor nameplate/datasheet facts. Any field may be missing from the submitted evidence. */
export interface MotorData {
  readonly evidenceRef: string;
  readonly phases?: number;
  readonly voltageV?: number;
  readonly frequencyHz?: number;
  readonly efficiencyClass?: EfficiencyClass;
  readonly efficiencyPct?: number;
  readonly ratedPowerKw?: number;
}

export interface PumpConfiguration {
  readonly id: ProductConfigId;
  readonly manufacturer: string;
  readonly model: string;
  readonly impellerDiameterMm: number;
  readonly speedRpm: number;
  readonly fluid: string;
  readonly curve?: PumpCurve;
  readonly motor?: MotorData;
  readonly attributes: Attributes;
}

/** Head at the duty flow must reach `minHeadM`, less an optional acceptance tolerance. */
export interface HeadAtFlowRequirement extends RequirementBase {
  readonly kind: "HEAD_AT_FLOW";
  readonly flowM3h: number;
  readonly minHeadM: number;
  readonly tolerancePct?: number;
}

/** WIRE_TO_WATER = pump efficiency × motor efficiency; drive losses are not included. */
export interface EfficiencyAtDutyRequirement extends RequirementBase {
  readonly kind: "EFFICIENCY_AT_DUTY";
  readonly flowM3h: number;
  readonly minEfficiencyPct: number;
  readonly basis: "PUMP" | "WIRE_TO_WATER";
}

/** NPSH available minus NPSH required at the duty flow must be at least `minMarginM`. */
export interface NpshMarginRequirement extends RequirementBase {
  readonly kind: "NPSH_MARGIN";
  readonly flowM3h: number;
  readonly npshAvailableM: number;
  readonly minMarginM: number;
}

/** Supply match, minimum IE class and, optionally, no overload anywhere on the tested curve. */
export interface MotorSupplyRequirement extends RequirementBase {
  readonly kind: "MOTOR_SUPPLY";
  readonly phases: number;
  readonly voltageV: number;
  readonly frequencyHz: number;
  readonly minEfficiencyClass: EfficiencyClass;
  readonly nonOverloading: boolean;
}

export type PumpRequirement =
  | GenericRequirement
  | HeadAtFlowRequirement
  | EfficiencyAtDutyRequirement
  | NpshMarginRequirement
  | MotorSupplyRequirement;

const EVALUATOR_VERSION = "centrifugal-pump@1";

export const CentrifugalPumpModule: EquipmentModule<PumpConfiguration, PumpRequirement> = {
  equipmentType: "CENTRIFUGAL_PUMP",
  evaluatorVersion: EVALUATOR_VERSION,
  evaluate(requirementSet: RequirementSet<PumpRequirement>, configuration: PumpConfiguration): ComplianceReport {
    const curve = validateCurve(configuration.curve, configuration);
    const findings = requirementSet.requirements.map((requirement) =>
      toFinding(requirement, configuration.attributes, () => evaluateRequirement(requirement, configuration, curve)),
    );
    return {
      configurationId: configuration.id,
      requirementSetId: requirementSet.id,
      requirementSetRevision: requirementSet.revision,
      evaluatorVersion: EVALUATOR_VERSION,
      status: overallStatus(findings),
      findings,
    };
  },
};

type Curve = ReturnType<typeof validateCurve>;

function evaluateRequirement(requirement: PumpRequirement, configuration: PumpConfiguration, curve: Curve): Verdict {
  switch (requirement.kind) {
    case "NUMERIC":
    case "STRING_MATCH":
    case "BOOLEAN":
      return evaluateGeneric(requirement, configuration.attributes);
    case "HEAD_AT_FLOW":
      return withCurve(curve, (c) => headAtFlow(requirement, c));
    case "EFFICIENCY_AT_DUTY":
      return withCurve(curve, (c) => efficiencyAtDuty(requirement, c, configuration.motor));
    case "NPSH_MARGIN":
      return withCurve(curve, (c) => npshMargin(requirement, c));
    case "MOTOR_SUPPLY":
      return motorSupply(requirement, configuration.motor, curve);
  }
}

function withCurve(curve: Curve, evaluate: (curve: ValidatedCurve) => Verdict): Verdict {
  return curve.ok ? evaluate(curve.curve) : unknown(curve.reason, curve.evidenceRefs);
}

function headAtFlow(requirement: HeadAtFlowRequirement, curve: ValidatedCurve): Verdict {
  const refs = [curve.evidenceRef];
  const tolerance = requirement.tolerancePct ?? 0;
  const invalid = invalidThreshold({ flow: requirement.flowM3h, "minimum head": requirement.minHeadM });
  if (invalid) return invalid;
  if (!(tolerance >= 0 && tolerance < 100)) return unknown(`Invalid tolerance ${tolerance}%`, refs);
  const head = interpolate(curve, requirement.flowM3h, "headM");
  if (!head.ok) return unknown(head.reason, refs);
  const threshold = requirement.minHeadM * (1 - tolerance / 100);
  const toleranceNote = tolerance > 0 ? ` (${tolerance}% tolerance: ≥ ${round(threshold)} m)` : "";
  return {
    result: head.value >= threshold - EPSILON ? "PASS" : "FAIL",
    explanation: `Head at ${requirement.flowM3h} m³/h is ${round(head.value)} m; required ≥ ${requirement.minHeadM} m${toleranceNote}`,
    evidenceRefs: refs,
    observed: round(head.value),
  };
}

function efficiencyAtDuty(
  requirement: EfficiencyAtDutyRequirement,
  curve: ValidatedCurve,
  motor: MotorData | undefined,
): Verdict {
  const refs = [curve.evidenceRef];
  const invalid = invalidThreshold({ flow: requirement.flowM3h, "minimum efficiency": requirement.minEfficiencyPct });
  if (invalid) return invalid;
  const pump = interpolate(curve, requirement.flowM3h, "efficiencyPct");
  if (!pump.ok) return unknown(pump.reason, refs);
  let efficiency = pump.value;
  let label = "Pump efficiency";
  if (requirement.basis === "WIRE_TO_WATER") {
    if (!hasEvidence(motor) || !isFiniteNumber(motor.efficiencyPct)) {
      return unknown("Wire-to-water efficiency needs an evidenced motor efficiency", refs);
    }
    if (!isPercent(motor.efficiencyPct)) {
      return unknown(`Motor efficiency ${motor.efficiencyPct}% is not a valid percentage`, [...refs, motor.evidenceRef]);
    }
    refs.push(motor.evidenceRef);
    efficiency = (pump.value * motor.efficiencyPct) / 100;
    label = `Wire-to-water efficiency (pump ${round(pump.value, 1)}% × motor ${motor.efficiencyPct}%)`;
  }
  return {
    result: efficiency >= requirement.minEfficiencyPct - EPSILON ? "PASS" : "FAIL",
    explanation: `${label} at ${requirement.flowM3h} m³/h is ${round(efficiency, 1)}%; required ≥ ${requirement.minEfficiencyPct}%`,
    evidenceRefs: refs,
    observed: round(efficiency, 2),
  };
}

function npshMargin(requirement: NpshMarginRequirement, curve: ValidatedCurve): Verdict {
  const refs = [curve.evidenceRef];
  const invalid = invalidThreshold({
    flow: requirement.flowM3h,
    "NPSH available": requirement.npshAvailableM,
    "minimum margin": requirement.minMarginM,
  });
  if (invalid) return invalid;
  const npshr = interpolate(curve, requirement.flowM3h, "npshrM");
  if (!npshr.ok) return unknown(npshr.reason, refs);
  const margin = requirement.npshAvailableM - npshr.value;
  return {
    result: margin >= requirement.minMarginM - EPSILON ? "PASS" : "FAIL",
    explanation: `NPSHr at ${requirement.flowM3h} m³/h is ${round(npshr.value, 2)} m; margin to NPSHa ${requirement.npshAvailableM} m is ${round(margin, 2)} m; required ≥ ${requirement.minMarginM} m`,
    evidenceRefs: refs,
    observed: round(margin, 3),
  };
}

type Check = { readonly result: "PASS" | "FAIL" | "UNKNOWN"; readonly note: string };

function motorSupply(requirement: MotorSupplyRequirement, motor: MotorData | undefined, curve: Curve): Verdict {
  const invalid = invalidThreshold({
    phases: requirement.phases,
    voltage: requirement.voltageV,
    frequency: requirement.frequencyHz,
  });
  if (invalid) return invalid;
  if (!hasEvidence(motor)) return unknown("No evidenced motor data");
  const refs = [motor.evidenceRef];
  const checks: Check[] = [
    matchCheck("phases", motor.phases, requirement.phases, ""),
    matchCheck("voltage", motor.voltageV, requirement.voltageV, " V"),
    matchCheck("frequency", motor.frequencyHz, requirement.frequencyHz, " Hz"),
    efficiencyClassCheck(motor.efficiencyClass, requirement.minEfficiencyClass),
  ];
  if (requirement.nonOverloading) {
    if (curve.ok) refs.push(curve.curve.evidenceRef);
    checks.push(overloadCheck(motor.ratedPowerKw, curve));
  }
  const result = checks.some((c) => c.result === "FAIL")
    ? "FAIL"
    : checks.some((c) => c.result === "UNKNOWN")
      ? "UNKNOWN"
      : "PASS";
  const notes = checks.filter((c) => result === "PASS" || c.result === result).map((c) => c.note);
  return { result, explanation: notes.join("; "), evidenceRefs: refs };
}

function matchCheck(label: string, actual: number | undefined, required: number, unit: string): Check {
  if (!isFiniteNumber(actual)) return { result: "UNKNOWN", note: `motor ${label} not stated` };
  return actual === required
    ? { result: "PASS", note: `${label} ${actual}${unit} matches` }
    : { result: "FAIL", note: `${label} ${actual}${unit}, required ${required}${unit}` };
}

function efficiencyClassCheck(actual: EfficiencyClass | undefined, minimum: EfficiencyClass): Check {
  const rank = actual === undefined ? -1 : EFFICIENCY_CLASSES.indexOf(actual);
  if (rank < 0) return { result: "UNKNOWN", note: "motor efficiency class not stated" };
  return rank >= EFFICIENCY_CLASSES.indexOf(minimum)
    ? { result: "PASS", note: `${actual} meets ${minimum}` }
    : { result: "FAIL", note: `${actual} is below ${minimum}` };
}

function overloadCheck(ratedPowerKw: number | undefined, curve: Curve): Check {
  if (!isFiniteNumber(ratedPowerKw)) return { result: "UNKNOWN", note: "motor rated power not stated" };
  if (!curve.ok) return { result: "UNKNOWN", note: `cannot check overload: ${curve.reason}` };
  const powers = curve.curve.points.map((point) => point.powerKw);
  if (!powers.every(isFiniteNumber)) {
    return { result: "UNKNOWN", note: "cannot check overload: curve does not state shaft power at every point" };
  }
  const peak = Math.max(...powers);
  return peak <= ratedPowerKw + EPSILON
    ? { result: "PASS", note: `peak shaft power ${round(peak, 2)} kW within ${ratedPowerKw} kW rating` }
    : { result: "FAIL", note: `peak shaft power ${round(peak, 2)} kW overloads the ${ratedPowerKw} kW motor` };
}

function hasEvidence(motor: MotorData | undefined): motor is MotorData {
  return motor !== undefined && hasRef(motor.evidenceRef);
}

function isFiniteNumber(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}
