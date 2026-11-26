import { hasRef } from "../evaluate.js";

/** One tested point of a manufacturer performance curve. */
export interface CurvePoint {
  readonly flowM3h: number;
  readonly headM: number;
  readonly efficiencyPct?: number;
  readonly npshrM?: number;
  readonly powerKw?: number;
}

/** The exact configuration a curve was published for. */
export interface CurveConditions {
  readonly model: string;
  readonly impellerDiameterMm: number;
  readonly speedRpm: number;
  readonly fluid: string;
}

export interface PumpCurve {
  readonly evidenceRef: string;
  readonly conditions: CurveConditions;
  readonly points: readonly CurvePoint[];
}

const CONDITION_KEYS = ["model", "impellerDiameterMm", "speedRpm", "fluid"] as const satisfies readonly (keyof CurveConditions)[];

export type CurveField ="headM" | "efficiencyPct" | "npshrM" | "powerKw";

export type Lookup = { readonly ok: true; readonly value: number } | { readonly ok: false; readonly reason: string };

/** A curve that has passed validation: sorted by flow, distinct flows, evidenced, matching conditions. */
export interface ValidatedCurve {
  readonly evidenceRef: string;
  readonly points: readonly CurvePoint[];
}

export type CurveCheck =
  | { readonly ok: true; readonly curve: ValidatedCurve }
  | { readonly ok: false; readonly reason: string; readonly evidenceRefs: readonly string[] };

export function validateCurve(curve: PumpCurve | undefined, configuration: CurveConditions): CurveCheck {
  if (!curve || !hasRef(curve.evidenceRef)) {
    return { ok: false, reason: "No evidenced performance curve", evidenceRefs: [] };
  }
  const refs = [curve.evidenceRef];
  const mismatch = CONDITION_KEYS.filter((key) => curve.conditions[key] !== configuration[key]);
  if (mismatch.length > 0) {
    return {
      ok: false,
      reason: `Curve is for a different configuration (${mismatch.join(", ")} differ); it cannot be applied`,
      evidenceRefs: refs,
    };
  }
  const points = [...curve.points].sort((a, b) => a.flowM3h - b.flowM3h);
  if (points.length < 2) return { ok: false, reason: "Curve needs at least two points", evidenceRefs: refs };
  for (const [i, point] of points.entries()) {
    if (!Number.isFinite(point.flowM3h) || !Number.isFinite(point.headM)) {
      return { ok: false, reason: "Curve has a non-numeric flow or head value", evidenceRefs: refs };
    }
    if (i > 0 && point.flowM3h === points[i - 1]!.flowM3h) {
      return { ok: false, reason: `Curve lists flow ${point.flowM3h} m³/h twice`, evidenceRefs: refs };
    }
  }
  return { ok: true, curve: { evidenceRef: curve.evidenceRef, points } };
}

/**
 * Linear interpolation of `field` at `flowM3h`, strictly inside the tested range.
 * Outside the range, or with a missing value at either bracketing point, there is no answer.
 */
export function interpolate(curve: ValidatedCurve, flowM3h: number, field: CurveField): Lookup {
  const { points } = curve;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (!Number.isFinite(flowM3h) || flowM3h < first.flowM3h || flowM3h > last.flowM3h) {
    return {
      ok: false,
      reason: `${flowM3h} m³/h is outside the curve's tested range (${first.flowM3h}–${last.flowM3h} m³/h); no extrapolation`,
    };
  }
  const upper = points.findIndex((point) => point.flowM3h >= flowM3h);
  const hi = points[upper]!;
  const lo = hi.flowM3h === flowM3h ? hi : points[upper - 1]!;
  const loValue = lo[field];
  const hiValue = hi[field];
  if (!isFiniteNumber(loValue) || !isFiniteNumber(hiValue)) {
    return { ok: false, reason: `Curve does not state ${FIELD_LABELS[field]} around ${flowM3h} m³/h` };
  }
  if (lo === hi) return { ok: true, value: loValue };
  const t = (flowM3h - lo.flowM3h) / (hi.flowM3h - lo.flowM3h);
  return { ok: true, value: loValue + t * (hiValue - loValue) };
}

export const FIELD_LABELS: Record<CurveField, string> = {
  headM: "head",
  efficiencyPct: "efficiency",
  npshrM: "NPSH required",
  powerKw: "shaft power",
};

function isFiniteNumber(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}
