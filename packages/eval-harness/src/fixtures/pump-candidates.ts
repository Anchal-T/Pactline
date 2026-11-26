// SYNTHETIC sandbox fixtures — requirement set from data/specs/pump-spec.md and three
// alternative pump configurations for the demo script (A passes, B fails head, C lacks
// motor evidence). Curves are invented but physically consistent (P = Q·H / (367·η)).
import type { ProductConfigId, RequirementId, RequirementSetId } from "@pactline/domain";
import type { PumpConfiguration, PumpRequirement, RequirementSet } from "@pactline/equipment-module";

const MANDATORY = { document: "data/specs/pump-spec.md", section: "Mandatory Requirements" };
const OPTIONAL = { document: "data/specs/pump-spec.md", section: "Optional Requirements" };
const rid = (value: string) => value as RequirementId;

export const REQ = {
  head: rid("req-head-at-duty"),
  efficiency: rid("req-wire-to-water-efficiency"),
  motor: rid("req-motor-supply"),
  npsh: rid("req-npsh-margin"),
  suction: rid("req-suction-dn"),
  discharge: rid("req-discharge-dn"),
  pressure: rid("req-pressure-rating"),
  connection: rid("req-connection-type"),
  impellerMaterial: rid("req-impeller-material"),
  vfd: rid("req-vfd-ready"),
} as const;

export const PUMP_REQUIREMENTS: RequirementSet<PumpRequirement> = {
  id: "rs-pump-chw-001" as RequirementSetId,
  revision: 1,
  requirements: [
    { id: REQ.head, kind: "HEAD_AT_FLOW", mandatory: true, source: MANDATORY, flowM3h: 100, minHeadM: 35, tolerancePct: 2 },
    { id: REQ.efficiency, kind: "EFFICIENCY_AT_DUTY", mandatory: true, source: MANDATORY, flowM3h: 100, minEfficiencyPct: 72, basis: "WIRE_TO_WATER" },
    { id: REQ.motor, kind: "MOTOR_SUPPLY", mandatory: true, source: MANDATORY, phases: 3, voltageV: 400, frequencyHz: 50, minEfficiencyClass: "IE3", nonOverloading: true },
    { id: REQ.npsh, kind: "NPSH_MARGIN", mandatory: true, source: MANDATORY, flowM3h: 100, npshAvailableM: 5.5, minMarginM: 1 },
    { id: REQ.suction, kind: "NUMERIC", mandatory: true, source: MANDATORY, property: "suction_dn", unit: "DN", comparison: { op: "EQ", value: 100 } },
    { id: REQ.discharge, kind: "NUMERIC", mandatory: true, source: MANDATORY, property: "discharge_dn", unit: "DN", comparison: { op: "EQ", value: 80 } },
    { id: REQ.pressure, kind: "NUMERIC", mandatory: true, source: MANDATORY, property: "pressure_rating", unit: "bar", comparison: { op: "GTE", value: 16 } },
    { id: REQ.connection, kind: "STRING_MATCH", mandatory: true, source: MANDATORY, property: "connection_type", oneOf: ["flanged"] },
    { id: REQ.impellerMaterial, kind: "STRING_MATCH", mandatory: false, source: OPTIONAL, property: "impeller_material", oneOf: ["stainless steel"] },
    { id: REQ.vfd, kind: "BOOLEAN", mandatory: false, source: OPTIONAL, property: "vfd_rated", expected: true },
  ],
};

const datasheet = (ref: string, impellerMaterial: string) => ({
  suction_dn: { value: 100, unit: "DN", evidenceRef: ref },
  discharge_dn: { value: 80, unit: "DN", evidenceRef: ref },
  pressure_rating: { value: 16, unit: "bar", evidenceRef: ref },
  connection_type: { value: "flanged", evidenceRef: ref },
  impeller_material: { value: impellerMaterial, evidenceRef: ref },
  vfd_rated: { value: true, evidenceRef: ref },
});

const identity = (model: string, impellerDiameterMm: number) => ({
  model,
  impellerDiameterMm,
  speedRpm: 1450,
  fluid: "water",
});

export const CANDIDATE_A: PumpConfiguration = {
  id: "cfg-sandbox-a" as ProductConfigId,
  manufacturer: "Sandbox Pump Co (synthetic)",
  ...identity("SBX-100-250", 255),
  curve: {
    evidenceRef: "sandbox://offers/a/curve.pdf#p2",
    conditions: identity("SBX-100-250", 255),
    points: [
      { flowM3h: 40, headM: 41.5, efficiencyPct: 58, npshrM: 1.9, powerKw: 7.8 },
      { flowM3h: 70, headM: 39.8, efficiencyPct: 72, npshrM: 2.4, powerKw: 10.54 },
      { flowM3h: 100, headM: 36.6, efficiencyPct: 79, npshrM: 3.3, powerKw: 12.62 },
      { flowM3h: 120, headM: 33.5, efficiencyPct: 79.5, npshrM: 4.1, powerKw: 13.78 },
      { flowM3h: 140, headM: 29.6, efficiencyPct: 77, npshrM: 5.2, powerKw: 14.66 },
    ],
  },
  motor: {
    evidenceRef: "sandbox://offers/a/motor.pdf#p1",
    phases: 3,
    voltageV: 400,
    frequencyHz: 50,
    efficiencyClass: "IE3",
    efficiencyPct: 92.6,
    ratedPowerKw: 18.5,
  },
  attributes: datasheet("sandbox://offers/a/datasheet.pdf#p1", "stainless steel"),
};

export const CANDIDATE_B: PumpConfiguration = {
  id: "cfg-sandbox-b" as ProductConfigId,
  manufacturer: "Sandbox Pump Co (synthetic)",
  ...identity("SBX-100-220", 225),
  curve: {
    evidenceRef: "sandbox://offers/b/curve.pdf#p2",
    conditions: identity("SBX-100-220", 225),
    points: [
      { flowM3h: 40, headM: 37, efficiencyPct: 57, npshrM: 1.8, powerKw: 7.07 },
      { flowM3h: 70, headM: 35.1, efficiencyPct: 71, npshrM: 2.3, powerKw: 9.43 },
      { flowM3h: 100, headM: 32, efficiencyPct: 77, npshrM: 3.1, powerKw: 11.32 },
      { flowM3h: 130, headM: 27.4, efficiencyPct: 75, npshrM: 4.6, powerKw: 12.94 },
    ],
  },
  motor: {
    evidenceRef: "sandbox://offers/b/motor.pdf#p1",
    phases: 3,
    voltageV: 400,
    frequencyHz: 50,
    efficiencyClass: "IE3",
    efficiencyPct: 92.1,
    ratedPowerKw: 15,
  },
  attributes: datasheet("sandbox://offers/b/datasheet.pdf#p1", "bronze"),
};

/** Submitted without any motor datasheet. */
export const CANDIDATE_C: PumpConfiguration = {
  id: "cfg-sandbox-c" as ProductConfigId,
  manufacturer: "Sandbox Pump Co (synthetic)",
  ...identity("SBX-100-260", 260),
  curve: {
    evidenceRef: "sandbox://offers/c/curve.pdf#p3",
    conditions: identity("SBX-100-260", 260),
    points: [
      { flowM3h: 50, headM: 40.2, efficiencyPct: 63, npshrM: 2, powerKw: 8.69 },
      { flowM3h: 100, headM: 36.1, efficiencyPct: 78, npshrM: 3.4, powerKw: 12.61 },
      { flowM3h: 150, headM: 28, efficiencyPct: 74, npshrM: 5.6, powerKw: 15.46 },
    ],
  },
  attributes: datasheet("sandbox://offers/c/datasheet.pdf#p1", "stainless steel"),
};
