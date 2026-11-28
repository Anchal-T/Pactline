// CentrifugalPumpModule — evaluates a pump configuration against a typed requirement set.
// Deterministic. Missing evidence is UNKNOWN, never PASS. No extrapolation beyond the digitized range.
import { curvePointText, configText } from "@pactline/domain";
import { convert } from "../units.js";
import type { CheckResult, Criterion, EquipmentModule, RequirementSet, Resolved, ValueSource, Verdict } from "../types.js";
import { pchip } from "./pchip.js";

export { pchip, type Pchip } from "./pchip.js";

export interface CurvePoint {
  flow_gpm: number;
  head_ft: number;
  pump_efficiency_pct?: number;
  npshr_ft?: number;
  power_hp?: number;
}

export interface PumpMotor {
  rated_power_hp?: number;
  rated_power_kw?: number;
  volts?: number | number[];
  phase?: number;
  hz?: number;
  efficiency_class?: string;
}

export interface PumpConfiguration {
  id: string;
  manufacturer: string;
  family: string;
  model: string;
  pump_type: string;
  impeller_diameter_in: number;
  curve_speed_rpm: number;
  market_frequency_hz: number;
  curve_fluid?: string;
  motor: PumpMotor | null;
  curve: {
    source_ref: string;
    method: string;
    estimated_read_error?: { head_ft?: number; efficiency_percentage_points?: number; npshr_ft?: number };
    points: CurvePoint[];
  };
  insulation?: { thickness_in?: number; jacketing_material?: string } | null;
  source_refs: string[];
}

const CURVE_FIELDS: Record<string, { key: keyof CurvePoint; unit: string; error: "head_ft" | "efficiency_percentage_points" | "npshr_ft" | null }> = {
  head_at_duty: { key: "head_ft", unit: "ft", error: "head_ft" },
  pump_efficiency_at_duty: { key: "pump_efficiency_pct", unit: "%", error: "efficiency_percentage_points" },
  npshr_at_duty: { key: "npshr_ft", unit: "ft", error: "npshr_ft" },
};

const submittalSource = (c: PumpConfiguration) => c.source_refs.find((s) => s.includes("submittal")) ?? c.source_refs[0] ?? c.curve.source_ref;

/**
 * Affinity laws for a speed change and/or impeller trim: Q ∝ k, H ∝ k², P ∝ k³ with k = (N₂/N₁)(D₂/D₁).
 * Efficiency is carried over unchanged and NPSHr scaled by k², both approximations that grow worse with
 * large trims; callers should flag trims beyond ~10–15 %.
 */
export function affinity(points: readonly CurvePoint[], k: number): CurvePoint[] {
  if (!(k > 0)) throw new Error("affinity: k must be positive");
  return points.map((p) => ({
    flow_gpm: p.flow_gpm * k,
    head_ft: p.head_ft * k * k,
    pump_efficiency_pct: p.pump_efficiency_pct,
    npshr_ft: p.npshr_ft === undefined ? undefined : p.npshr_ft * k * k,
    power_hp: p.power_hp === undefined ? undefined : p.power_hp * k * k * k,
  }));
}

/** Interpolate one curve quantity at a flow, citing the points it came from. */
export function curveValueAt(config: PumpConfiguration, key: keyof CurvePoint, flowGpm: number): { value: number; excerpts: string[]; exact: boolean } | undefined {
  const pts = config.curve.points.filter((p) => typeof p[key] === "number").sort((a, b) => a.flow_gpm - b.flow_gpm);
  if (pts.length === 0) return undefined;
  const exact = pts.find((p) => p.flow_gpm === flowGpm);
  if (exact) return { value: exact[key] as number, excerpts: [curvePointText(config.id, exact as never)], exact: true };
  if (pts.length < 2) return undefined;
  const f = pchip(pts.map((p) => p.flow_gpm), pts.map((p) => p[key] as number));
  const v = f.at(flowGpm);
  if (v === undefined) return undefined;
  const hi = pts.findIndex((p) => p.flow_gpm > flowGpm);
  const bracket = [pts[hi - 1]!, pts[hi]!];
  return { value: Math.round(v * 100) / 100, excerpts: bracket.map((p) => curvePointText(config.id, p as never)), exact: false };
}

export class CentrifugalPumpModule implements EquipmentModule<PumpConfiguration> {
  readonly kind = "CENTRIFUGAL_PUMP";
  readonly version = "1.0.0";
  readonly fields = [
    "pump_type",
    "head_at_duty",
    "pump_efficiency_at_duty",
    "npshr_at_duty",
    "motor_rated_power",
    "compatible_supply_voltage",
    "motor_phase_count",
    "motor_frequency",
    "elastomeric_insulation_thickness",
    "insulation_jacketing_material",
  ] as const;

  resolve(config: PumpConfiguration, field: string, duty: Record<string, unknown>): Resolved {
    const curveField = CURVE_FIELDS[field];
    if (curveField) {
      const flow = typeof duty.flow_gpm === "number" ? duty.flow_gpm : convert(Number(duty.flow_m3h), "m3/h", "gpm");
      if (flow === undefined || !Number.isFinite(flow)) return { known: false, reason: "duty flow is not stated", missing: "Duty flow for the requirement set" };
      const r = curveValueAt(config, curveField.key, flow);
      if (!r) {
        const flows = config.curve.points.map((p) => p.flow_gpm);
        return {
          known: false,
          reason: `duty flow ${flow} gpm is outside the digitized range ${Math.min(...flows)}–${Math.max(...flows)} gpm; not extrapolated`,
          missing: `A ${String(curveField.key)} curve that brackets ${flow} gpm for this impeller and speed`,
        };
      }
      const err = curveField.error ? config.curve.estimated_read_error?.[curveField.error] : undefined;
      return {
        known: true,
        value: r.value,
        unit: curveField.unit,
        error_band: err,
        source: { source_id: config.curve.source_ref, excerpts: r.excerpts, derived: !r.exact, method: r.exact ? "read at a digitized point" : "monotone PCHIP between digitized points" },
      };
    }

    const sub: ValueSource = { source_id: submittalSource(config), excerpts: [configText(config as never)], derived: false, method: "configuration record" };
    const motor = config.motor;
    const noMotor: Resolved = { known: false, reason: "the cited submittal lists no motor for this configuration", missing: "Selected motor data sheet or nameplate (power, voltage, phase, frequency)" };
    switch (field) {
      case "pump_type":
        return { known: true, value: config.pump_type, source: sub };
      case "motor_rated_power":
        if (!motor) return noMotor;
        if (motor.rated_power_hp !== undefined) return { known: true, value: motor.rated_power_hp, unit: "hp", source: sub };
        if (motor.rated_power_kw !== undefined) return { known: true, value: motor.rated_power_kw, unit: "kW", source: sub };
        return { ...noMotor, reason: "motor rated power is not stated" };
      case "compatible_supply_voltage":
        if (!motor?.volts) return motor ? { ...noMotor, reason: "motor voltage is not stated" } : noMotor;
        return { known: true, value: Array.isArray(motor.volts) ? motor.volts.join("/") : motor.volts, unit: "V", source: sub };
      case "motor_phase_count":
        return motor?.phase !== undefined ? { known: true, value: motor.phase, source: sub } : motor ? { ...noMotor, reason: "motor phase is not stated" } : noMotor;
      case "motor_frequency":
        return motor?.hz !== undefined ? { known: true, value: motor.hz, unit: "Hz", source: sub } : motor ? { ...noMotor, reason: "motor frequency is not stated" } : noMotor;
      case "elastomeric_insulation_thickness":
        return config.insulation?.thickness_in !== undefined
          ? { known: true, value: config.insulation.thickness_in, unit: "in", source: sub }
          : { known: false, reason: "no insulation data in the configuration's submittal", missing: "Package or installation submittal stating the insulation thickness" };
      case "insulation_jacketing_material":
        return config.insulation?.jacketing_material
          ? { known: true, value: config.insulation.jacketing_material, source: sub }
          : { known: false, reason: "no jacketing data in the configuration's submittal", missing: "Package or installation submittal stating the jacketing material" };
      default:
        return { known: false, reason: `the pump module has no rule for field ${field}`, missing: `A rule and evidence for ${field}` };
    }
  }

  evaluate(requirements: RequirementSet, config: PumpConfiguration): CheckResult[] {
    return requirements.criteria.map((c) => this.check(c, config, requirements.duty_point));
  }

  private check(c: Criterion, config: PumpConfiguration, duty: Record<string, unknown>): CheckResult {
    const base = { criterion_id: c.id, field: c.predicate.field, mandatory: c.mandatory, required: { operator: c.predicate.operator, value: c.predicate.value, unit: c.predicate.unit }, rule_id: `pump.${c.predicate.field}` };
    const r = this.resolve(config, c.predicate.field, duty);
    if (!r.known) return { ...base, verdict: "UNKNOWN", reason: r.reason, missing: r.missing };
    return { ...base, ...compare(c, r), measured: { value: r.value, unit: r.unit }, source: r.source };
  }
}

/** Compare a resolved value with a predicate. Calibrated abstention: a margin inside the error band is UNKNOWN. */
function compare(c: Criterion, r: Extract<Resolved, { known: true }>): { verdict: Verdict; reason: string; margin?: number; error_band?: number; missing?: string } {
  const p = c.predicate;
  if (typeof r.value === "string" || typeof p.value === "string" || Array.isArray(p.value)) {
    const got = String(r.value).toUpperCase();
    const want = (Array.isArray(p.value) ? p.value : [p.value]).map((v) => String(v).toUpperCase());
    const hit = p.operator === "NE" ? !want.includes(got) : want.some((w) => got === w || got.split("/").includes(w));
    return { verdict: hit ? "PASS" : "FAIL", reason: `${p.field} is ${String(r.value)}; required ${p.operator} ${want.join(" or ")}` };
  }

  const measured = p.unit && r.unit ? convert(r.value, r.unit, p.unit) : r.value;
  if (measured === undefined) return { verdict: "UNKNOWN", reason: `cannot compare ${r.unit ?? "unitless"} with ${p.unit ?? "unitless"}`, missing: `${p.field} in ${p.unit}` };
  const band = r.error_band !== undefined && p.unit && r.unit ? convert(r.error_band, r.unit, p.unit) : r.error_band;
  const required = p.value;
  const signed: Record<string, number> = { GTE: measured - required, GT: measured - required, LTE: required - measured, LT: required - measured };
  const unit = p.unit ? ` ${p.unit}` : "";

  if (p.operator in signed) {
    const margin = Math.round(signed[p.operator]! * 100) / 100;
    if (band !== undefined && Math.abs(margin) <= band) {
      return { verdict: "UNKNOWN", margin, error_band: band, reason: `margin ${margin}${unit} is within the reading error of ±${band}${unit}`, missing: `A more precise value for ${p.field} (published table or test data)` };
    }
    const ok = p.operator.length === 3 ? margin >= 0 : margin > 0;
    return { verdict: ok ? "PASS" : "FAIL", margin, error_band: band, reason: `${p.field} ${measured}${unit} vs required ${p.operator} ${required}${unit} (margin ${margin}${unit})` };
  }

  const diff = Math.abs(measured - required);
  const hit = p.operator === "EQ" ? diff <= 1e-9 : diff > 1e-9;
  return { verdict: hit ? "PASS" : "FAIL", reason: `${p.field} is ${measured}${unit}; required ${p.operator} ${required}${unit}` };
}
