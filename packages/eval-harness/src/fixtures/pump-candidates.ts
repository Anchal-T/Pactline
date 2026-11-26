import { readFileSync } from "node:fs";
import type { ProductConfigId, RequirementId, RequirementSetId } from "@pactline/domain";
import type { PumpConfiguration, PumpRequirement, RequirementSet } from "@pactline/equipment-module";

interface EvidenceSource {
  id: string;
  url: string;
  locator: string;
}

interface PumpReference {
  requirements: {
    id: string;
    revision: number;
    duty_point: { flow_gpm: number };
    criteria: Array<{
      id: string;
      mandatory: boolean;
      predicate: { operator: string; value: unknown; unit?: string };
      source_refs: string[];
    }>;
  };
  product_configurations: Array<{
    id: string;
    manufacturer: string;
    model: string;
    impeller_diameter_in: number;
    curve_speed_rpm: number;
    market_frequency_hz: number;
    curve_fluid: string;
    motor: unknown;
    curve: {
      source_ref: string;
      points: Array<{ flow_gpm: number; head_ft: number; pump_efficiency_pct: number; npshr_ft: number }>;
    };
  }>;
  evidence_sources: EvidenceSource[];
}

const reference = JSON.parse(
  readFileSync(new URL("../../../../data/specs/pump-reference.json", import.meta.url), "utf8"),
) as PumpReference;

const METERS_PER_FOOT = 0.3048;
const MM_PER_INCH = 25.4;
const CUBIC_METERS_PER_HOUR_PER_GPM = 0.22712470704;

export const REQ = {
  head: "head-at-duty" as RequirementId,
  efficiency: "pump-efficiency-at-duty" as RequirementId,
  motorVoltage: "motor-voltage" as RequirementId,
} as const;

function evidence(id: string | undefined): EvidenceSource {
  const source = reference.evidence_sources.find((entry) => entry.id === id);
  if (!source) throw new Error(`Missing pump reference source ${id}`);
  return source;
}

function criterion(id: RequirementId, operator: string, unit: string) {
  const entry = reference.requirements.criteria.find((item) => item.id === id);
  if (
    !entry ||
    entry.predicate.operator !== operator ||
    entry.predicate.unit !== unit ||
    typeof entry.predicate.value !== "number" ||
    !Number.isFinite(entry.predicate.value)
  ) {
    throw new Error(`Invalid pump reference criterion ${id}`);
  }
  const source = evidence(entry.source_refs[0]);
  return { id, mandatory: entry.mandatory, source: { document: source.url, section: source.locator }, value: entry.predicate.value };
}

const flowM3h = reference.requirements.duty_point.flow_gpm * CUBIC_METERS_PER_HOUR_PER_GPM;
const { value: headFt, ...head } = criterion(REQ.head, "GTE", "ft");
const { value: efficiencyPct, ...efficiency } = criterion(REQ.efficiency, "GTE", "%");
const { value: voltageV, ...voltage } = criterion(REQ.motorVoltage, "EQ", "V");

// These cases evaluate only the criteria they exercise. Unresolved site and motor evidence
// in the reference fixture still prevents an equipment acceptance decision.
export const PUMP_REQUIREMENTS: RequirementSet<PumpRequirement> = {
  id: reference.requirements.id as RequirementSetId,
  revision: reference.requirements.revision,
  requirements: [
    { ...head, kind: "HEAD_AT_FLOW", flowM3h, minHeadM: headFt * METERS_PER_FOOT },
    { ...efficiency, kind: "EFFICIENCY_AT_DUTY", flowM3h, minEfficiencyPct: efficiencyPct, basis: "PUMP" },
    { ...voltage, kind: "NUMERIC", property: "compatible_supply_voltage", unit: "V", comparison: { op: "EQ", value: voltageV } },
  ],
};

function configuration(id: string): PumpConfiguration {
  const entry = reference.product_configurations.find((item) => item.id === id);
  if (!entry || entry.market_frequency_hz !== 60 || entry.motor !== null) {
    throw new Error(`Expected a 60 Hz reference configuration without selected motor evidence: ${id}`);
  }
  const conditions = {
    model: entry.model,
    impellerDiameterMm: entry.impeller_diameter_in * MM_PER_INCH,
    speedRpm: entry.curve_speed_rpm,
    fluid: entry.curve_fluid,
  };
  return {
    id: entry.id as ProductConfigId,
    manufacturer: entry.manufacturer,
    ...conditions,
    curve: {
      conditions,
      evidenceRef: evidence(entry.curve.source_ref).url,
      points: entry.curve.points.map((point) => ({
        flowM3h: point.flow_gpm * CUBIC_METERS_PER_HOUR_PER_GPM,
        headM: point.head_ft * METERS_PER_FOOT,
        efficiencyPct: point.pump_efficiency_pct,
        npshrM: point.npshr_ft * METERS_PER_FOOT,
      })),
    },
    attributes: {},
  };
}

export const BELL_AND_GOSSETT = configuration("cfg-bg-e1510-125bc-950-1750");
export const TACO = configuration("cfg-taco-fi1206d-625-1760");
