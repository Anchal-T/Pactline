import type { ProductConfigId, RequirementId, RequirementSetId } from "@pactline/domain";
import { describe, expect, it } from "vitest";
import {
  type ComplianceFinding,
  type PumpConfiguration,
  type PumpRequirement,
  type RequirementSet,
  CentrifugalPumpModule,
} from "../index.js";

// SYNTHETIC test data only. Shaft power is consistent with Q·H / (367·η).
const SPEC = { document: "data/specs/pump-spec.md", section: "Mandatory Requirements" };
const OPTIONAL = { document: "data/specs/pump-spec.md", section: "Optional Requirements" };
const rid = (value: string) => value as RequirementId;

const REQUIREMENTS: RequirementSet<PumpRequirement> = {
  id: "rs-pump-chw-001" as RequirementSetId,
  revision: 3,
  requirements: [
    { id: rid("head"), kind: "HEAD_AT_FLOW", mandatory: true, source: SPEC, flowM3h: 100, minHeadM: 35, tolerancePct: 2 },
    { id: rid("efficiency"), kind: "EFFICIENCY_AT_DUTY", mandatory: true, source: SPEC, flowM3h: 100, minEfficiencyPct: 72, basis: "WIRE_TO_WATER" },
    { id: rid("motor"), kind: "MOTOR_SUPPLY", mandatory: true, source: SPEC, phases: 3, voltageV: 400, frequencyHz: 50, minEfficiencyClass: "IE3", nonOverloading: true },
    { id: rid("npsh"), kind: "NPSH_MARGIN", mandatory: true, source: SPEC, flowM3h: 100, npshAvailableM: 5.5, minMarginM: 1 },
    { id: rid("suction"), kind: "NUMERIC", mandatory: true, source: SPEC, property: "suction_dn", unit: "DN", comparison: { op: "EQ", value: 100 } },
    { id: rid("discharge"), kind: "NUMERIC", mandatory: true, source: SPEC, property: "discharge_dn", unit: "DN", comparison: { op: "EQ", value: 80 } },
    { id: rid("pressure"), kind: "NUMERIC", mandatory: true, source: SPEC, property: "pressure_rating", unit: "bar", comparison: { op: "GTE", value: 16 } },
    { id: rid("connection"), kind: "STRING_MATCH", mandatory: true, source: SPEC, property: "connection_type", oneOf: ["Flanged"] },
    { id: rid("impeller-material"), kind: "STRING_MATCH", mandatory: false, source: OPTIONAL, property: "impeller_material", oneOf: ["stainless steel"] },
    { id: rid("vfd"), kind: "BOOLEAN", mandatory: false, source: OPTIONAL, property: "vfd_rated", expected: true },
  ],
};

const attrs = (ref: string, impeller: string) => ({
  suction_dn: { value: 100, unit: "DN", evidenceRef: ref },
  discharge_dn: { value: 80, unit: "DN", evidenceRef: ref },
  pressure_rating: { value: 16, unit: "bar", evidenceRef: ref },
  connection_type: { value: "flanged", evidenceRef: ref },
  impeller_material: { value: impeller, evidenceRef: ref },
  vfd_rated: { value: true, evidenceRef: ref },
});

const identity = (model: string, impellerDiameterMm: number) => ({
  model,
  impellerDiameterMm,
  speedRpm: 1450,
  fluid: "water",
});

const CANDIDATE_A: PumpConfiguration = {
  id: "cfg-a" as ProductConfigId,
  manufacturer: "Synthetic Pumps Co",
  ...identity("SP-100-250", 255),
  curve: {
    evidenceRef: "sandbox://submittals/a/curve.pdf#p2",
    conditions: identity("SP-100-250", 255),
    points: [
      { flowM3h: 70, headM: 39.8, efficiencyPct: 72, npshrM: 2.4, powerKw: 10.54 },
      { flowM3h: 40, headM: 41.5, efficiencyPct: 58, npshrM: 1.9, powerKw: 7.8 },
      { flowM3h: 100, headM: 36.6, efficiencyPct: 79, npshrM: 3.3, powerKw: 12.62 },
      { flowM3h: 120, headM: 33.5, efficiencyPct: 79.5, npshrM: 4.1, powerKw: 13.78 },
      { flowM3h: 140, headM: 29.6, efficiencyPct: 77, npshrM: 5.2, powerKw: 14.66 },
    ],
  },
  motor: {
    evidenceRef: "sandbox://submittals/a/motor.pdf#p1",
    phases: 3,
    voltageV: 400,
    frequencyHz: 50,
    efficiencyClass: "IE3",
    efficiencyPct: 92.6,
    ratedPowerKw: 18.5,
  },
  attributes: attrs("sandbox://submittals/a/datasheet.pdf#p1", "Stainless Steel"),
};

const CANDIDATE_B: PumpConfiguration = {
  id: "cfg-b" as ProductConfigId,
  manufacturer: "Synthetic Pumps Co",
  ...identity("SP-100-220", 225),
  curve: {
    evidenceRef: "sandbox://submittals/b/curve.pdf#p2",
    conditions: identity("SP-100-220", 225),
    points: [
      { flowM3h: 40, headM: 37, efficiencyPct: 57, npshrM: 1.8, powerKw: 7.07 },
      { flowM3h: 70, headM: 35.1, efficiencyPct: 71, npshrM: 2.3, powerKw: 9.43 },
      { flowM3h: 100, headM: 32, efficiencyPct: 77, npshrM: 3.1, powerKw: 11.32 },
      { flowM3h: 130, headM: 27.4, efficiencyPct: 75, npshrM: 4.6, powerKw: 12.94 },
    ],
  },
  motor: {
    evidenceRef: "sandbox://submittals/b/motor.pdf#p1",
    phases: 3,
    voltageV: 400,
    frequencyHz: 50,
    efficiencyClass: "IE3",
    efficiencyPct: 92.1,
    ratedPowerKw: 15,
  },
  attributes: attrs("sandbox://submittals/b/datasheet.pdf#p1", "bronze"),
};

const CANDIDATE_C: PumpConfiguration = {
  id: "cfg-c" as ProductConfigId,
  manufacturer: "Synthetic Pumps Co",
  ...identity("SP-100-260", 260),
  curve: {
    evidenceRef: "sandbox://submittals/c/curve.pdf#p3",
    conditions: identity("SP-100-260", 260),
    points: [
      { flowM3h: 50, headM: 40.2, efficiencyPct: 63, npshrM: 2, powerKw: 8.69 },
      { flowM3h: 100, headM: 36.1, efficiencyPct: 78, npshrM: 3.4, powerKw: 12.61 },
      { flowM3h: 150, headM: 28, efficiencyPct: 74, npshrM: 5.6, powerKw: 15.46 },
    ],
  },
  attributes: attrs("sandbox://submittals/c/datasheet.pdf#p1", "stainless steel"),
};

const evaluate = (configuration: PumpConfiguration, requirements = REQUIREMENTS) =>
  CentrifugalPumpModule.evaluate(requirements, configuration);

const finding = (configuration: PumpConfiguration, id: string, requirements = REQUIREMENTS): ComplianceFinding =>
  evaluate(configuration, requirements).findings.find((f) => f.requirementId === id)!;

const only = (requirement: PumpRequirement): RequirementSet<PumpRequirement> => ({
  ...REQUIREMENTS,
  requirements: [requirement],
});

const headRequirement = REQUIREMENTS.requirements[0]!;
const motorRequirement = REQUIREMENTS.requirements[2]!;

describe("CentrifugalPumpModule — demo candidates", () => {
  it("candidate A passes every requirement with evidence", () => {
    const report = evaluate(CANDIDATE_A);
    expect(report).toMatchObject({
      configurationId: "cfg-a",
      requirementSetId: "rs-pump-chw-001",
      requirementSetRevision: 3,
      evaluatorVersion: "centrifugal-pump@1",
      status: "COMPLIANT",
    });
    for (const f of report.findings) {
      expect(f.result).toBe("PASS");
      expect(f.evidenceRefs.length).toBeGreaterThan(0);
    }
    expect(finding(CANDIDATE_A, "head").observed).toBe(36.6);
    expect(finding(CANDIDATE_A, "efficiency").observed).toBe(73.15);
    expect(finding(CANDIDATE_A, "npsh").observed).toBe(2.2);
    expect(finding(CANDIDATE_A, "motor").evidenceRefs).toEqual([
      "sandbox://submittals/a/motor.pdf#p1",
      "sandbox://submittals/a/curve.pdf#p2",
    ]);
  });

  it("candidate B fails mandatory head at duty flow (scenario 3)", () => {
    const report = evaluate(CANDIDATE_B);
    expect(report.status).toBe("NON_COMPLIANT");
    expect(finding(CANDIDATE_B, "head")).toMatchObject({
      result: "FAIL",
      observed: 32,
      evidenceRefs: ["sandbox://submittals/b/curve.pdf#p2"],
      source: SPEC,
    });
    expect(finding(CANDIDATE_B, "impeller-material")).toMatchObject({ result: "FAIL", mandatory: false });
  });

  it("candidate C is UNKNOWN, never PASS, without motor evidence (scenario 4)", () => {
    const report = evaluate(CANDIDATE_C);
    expect(report.status).toBe("INCOMPLETE");
    expect(finding(CANDIDATE_C, "motor")).toMatchObject({ result: "UNKNOWN", evidenceRefs: [] });
    expect(finding(CANDIDATE_C, "efficiency").result).toBe("UNKNOWN");
    expect(finding(CANDIDATE_C, "head").result).toBe("PASS");
  });
});

describe("curve evaluation", () => {
  it("interpolates linearly between tested points", () => {
    const req = { ...headRequirement, flowM3h: 85 } as PumpRequirement;
    expect(finding(CANDIDATE_A, "head", only(req)).observed).toBe(38.2);
  });

  it("refuses to extrapolate beyond the tested range", () => {
    const req = { ...headRequirement, flowM3h: 150 } as PumpRequirement;
    const f = finding(CANDIDATE_A, "head", only(req));
    expect(f.result).toBe("UNKNOWN");
    expect(f.explanation).toMatch(/outside the curve's tested range/);
  });

  it("applies the acceptance tolerance at the boundary", () => {
    const withHead = (headM: number): PumpConfiguration => ({
      ...CANDIDATE_A,
      curve: {
        ...CANDIDATE_A.curve!,
        points: [
          { flowM3h: 90, headM: headM + 1 },
          { flowM3h: 100, headM },
        ],
      },
    });
    expect(finding(withHead(34.3), "head", only(headRequirement)).result).toBe("PASS");
    expect(finding(withHead(34.29), "head", only(headRequirement)).result).toBe("FAIL");
  });

  it("does not apply a curve published for a different impeller", () => {
    const mismatched: PumpConfiguration = { ...CANDIDATE_A, impellerDiameterMm: 240 };
    const f = finding(mismatched, "head", only(headRequirement));
    expect(f.result).toBe("UNKNOWN");
    expect(f.explanation).toMatch(/impellerDiameterMm/);
  });

  it("treats inconsistent or unevidenced curves as UNKNOWN", () => {
    const duplicate: PumpConfiguration = {
      ...CANDIDATE_A,
      curve: { ...CANDIDATE_A.curve!, points: [...CANDIDATE_A.curve!.points, { flowM3h: 100, headM: 30 }] },
    };
    expect(finding(duplicate, "head", only(headRequirement)).result).toBe("UNKNOWN");
    const unsourced: PumpConfiguration = { ...CANDIDATE_A, curve: { ...CANDIDATE_A.curve!, evidenceRef: " " } };
    expect(finding(unsourced, "head", only(headRequirement)).result).toBe("UNKNOWN");
    const noCurve: PumpConfiguration = { ...CANDIDATE_A, curve: undefined };
    expect(evaluate(noCurve).status).toBe("INCOMPLETE");
  });

  it("is UNKNOWN when the curve omits the value needed", () => {
    const noNpsh: PumpConfiguration = {
      ...CANDIDATE_A,
      curve: { ...CANDIDATE_A.curve!, points: CANDIDATE_A.curve!.points.map(({ npshrM: _, ...p }) => p) },
    };
    expect(finding(noNpsh, "npsh").result).toBe("UNKNOWN");
  });
});

describe("motor supply", () => {
  it("fails a motor that overloads on the tested curve", () => {
    const small: PumpConfiguration = { ...CANDIDATE_A, motor: { ...CANDIDATE_A.motor!, ratedPowerKw: 11 } };
    const f = finding(small, "motor");
    expect(f.result).toBe("FAIL");
    expect(f.explanation).toMatch(/overloads the 11 kW motor/);
  });

  it("lets a definite mismatch outweigh missing fields", () => {
    const wrongSupply: PumpConfiguration = {
      ...CANDIDATE_A,
      motor: { evidenceRef: "sandbox://m.pdf", frequencyHz: 60, efficiencyClass: "IE2" },
    };
    const f = finding(wrongSupply, "motor", only(motorRequirement));
    expect(f.result).toBe("FAIL");
    expect(f.explanation).toBe("frequency 60 Hz, required 50 Hz; IE2 is below IE3");
  });

  it("is UNKNOWN when motor fields are partially stated", () => {
    const partial: PumpConfiguration = {
      ...CANDIDATE_A,
      motor: { evidenceRef: "sandbox://m.pdf", phases: 3, voltageV: 400, frequencyHz: 50 },
    };
    const f = finding(partial, "motor", only(motorRequirement));
    expect(f.result).toBe("UNKNOWN");
    expect(f.explanation).toBe("motor efficiency class not stated; motor rated power not stated");
  });
});

describe("generic predicates", () => {
  const numeric = (overrides: object): PumpRequirement =>
    ({ ...REQUIREMENTS.requirements[6]!, ...overrides }) as PumpRequirement;

  it("supports range, less-than and equality comparisons", () => {
    expect(finding(CANDIDATE_A, "pressure", only(numeric({ comparison: { op: "RANGE", min: 10, max: 16 } }))).result).toBe("PASS");
    expect(finding(CANDIDATE_A, "pressure", only(numeric({ comparison: { op: "LTE", value: 10 } }))).result).toBe("FAIL");
    expect(finding(CANDIDATE_A, "pressure", only(numeric({ comparison: { op: "EQ", value: 16 } }))).result).toBe("PASS");
  });

  it("does not convert units implicitly", () => {
    const f = finding(CANDIDATE_A, "pressure", only(numeric({ unit: "kPa" })));
    expect(f.result).toBe("UNKNOWN");
    expect(f.explanation).toMatch(/stated in bar/);
  });

  it("is UNKNOWN for missing, unsourced or wrongly typed evidence", () => {
    const tampered = (attribute: object): PumpConfiguration => ({
      ...CANDIDATE_A,
      attributes: { ...CANDIDATE_A.attributes, pressure_rating: attribute as never },
    });
    expect(finding(tampered({ value: 16, unit: "bar", evidenceRef: "" }), "pressure").result).toBe("UNKNOWN");
    expect(finding(tampered({ value: "16", unit: "bar", evidenceRef: "x" }), "pressure").result).toBe("UNKNOWN");
    expect(finding(tampered({ value: Number.NaN, unit: "bar", evidenceRef: "x" }), "pressure").result).toBe("UNKNOWN");
    const { pressure_rating: _, ...rest } = CANDIDATE_A.attributes;
    expect(finding({ ...CANDIDATE_A, attributes: rest }, "pressure").result).toBe("UNKNOWN");
  });
});

describe("malformed input never produces an unsupported FAIL or PASS", () => {
  it("reports non-numeric requirement thresholds as UNKNOWN", () => {
    const cases: PumpRequirement[] = [
      { ...headRequirement, minHeadM: Number.NaN } as PumpRequirement,
      { ...REQUIREMENTS.requirements[1]!, minEfficiencyPct: Number.NaN } as PumpRequirement,
      { ...REQUIREMENTS.requirements[3]!, npshAvailableM: Number.NaN } as PumpRequirement,
      { ...motorRequirement, voltageV: Number.NaN } as PumpRequirement,
      { ...REQUIREMENTS.requirements[6]!, comparison: { op: "GTE", value: Number.NaN } } as PumpRequirement,
    ];
    for (const requirement of cases) {
      const f = CentrifugalPumpModule.evaluate(only(requirement), CANDIDATE_A).findings[0]!;
      expect(f.result).toBe("UNKNOWN");
      expect(f.explanation).toMatch(/Requirement has a non-numeric/);
    }
  });

  it("rejects efficiency evidence outside 0–100%", () => {
    const badMotor: PumpConfiguration = { ...CANDIDATE_A, motor: { ...CANDIDATE_A.motor!, efficiencyPct: 926 } };
    expect(finding(badMotor, "efficiency").result).toBe("UNKNOWN");
  });

  it("tolerates evidence records missing their reference field", () => {
    const untyped = { ...CANDIDATE_A, motor: { phases: 3 } } as unknown as PumpConfiguration;
    expect(finding(untyped, "motor").result).toBe("UNKNOWN");
  });
});

describe("applicability", () => {
  const vfdOnly = {
    ...REQUIREMENTS.requirements[9]!,
    mandatory: true,
    appliesWhen: { property: "drive", equals: "VFD" },
  } as PumpRequirement;
  const withDrive = (drive?: string): PumpConfiguration => ({
    ...CANDIDATE_B,
    attributes: {
      ...CANDIDATE_B.attributes,
      vfd_rated: { value: false, evidenceRef: "sandbox://b.pdf" },
      ...(drive ? { drive: { value: drive, evidenceRef: "sandbox://b.pdf" } } : {}),
    },
  });

  it("marks a requirement NOT_APPLICABLE when its condition is evidenced false", () => {
    const report = CentrifugalPumpModule.evaluate(only(vfdOnly), withDrive("direct-on-line"));
    expect(report.findings[0]).toMatchObject({ result: "NOT_APPLICABLE", evidenceRefs: ["sandbox://b.pdf"] });
    expect(report.status).toBe("COMPLIANT");
  });

  it("evaluates the requirement when its condition holds", () => {
    expect(CentrifugalPumpModule.evaluate(only(vfdOnly), withDrive("vfd")).findings[0]!.result).toBe("FAIL");
  });

  it("is UNKNOWN when applicability cannot be determined", () => {
    expect(CentrifugalPumpModule.evaluate(only(vfdOnly), withDrive()).findings[0]!.result).toBe("UNKNOWN");
  });
});
