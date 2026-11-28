import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { affinity, CentrifugalPumpModule, curveValueAt, pchip, type PumpConfiguration, type RequirementSet } from "../index.js";

const ref = JSON.parse(readFileSync(join(__dirname, "../../../../data/specs/pump-reference.json"), "utf8"));
const reqs = ref.requirements as RequirementSet;
const configs = ref.product_configurations as PumpConfiguration[];
const bg = configs.find((c) => c.id.startsWith("cfg-bg"))!;
const taco = configs.find((c) => c.id.startsWith("cfg-taco"))!;
const pump = new CentrifugalPumpModule();
const verdict = (c: PumpConfiguration, id: string) => pump.evaluate(reqs, c).find((r) => r.criterion_id === id)!;

describe("pchip", () => {
  it("passes through the points and stays monotone between them", () => {
    const f = pchip([50, 60, 70], [101.5, 99.5, 96.5]);
    expect(f.at(60)).toBe(99.5);
    for (let x = 50; x <= 70; x += 0.5) {
      const v = f.at(x)!;
      expect(v).toBeLessThanOrEqual(101.5);
      expect(v).toBeGreaterThanOrEqual(96.5);
    }
    expect(f.at(65)!).toBeLessThan(99.5);
    expect(f.at(65)!).toBeGreaterThan(96.5);
  });
  it("refuses to extrapolate", () => {
    const f = pchip([50, 70], [10, 20]);
    expect(f.at(49.9)).toBeUndefined();
    expect(f.at(70.1)).toBeUndefined();
  });
  it("rejects unsorted input", () => expect(() => pchip([2, 1], [0, 0])).toThrow(/increasing/));
});

describe("CentrifugalPumpModule on the reference fixture", () => {
  it("reproduces every expected finding in pump-reference.json", () => {
    for (const e of ref.expected_findings as Array<{ configuration_id: string; criterion_id: string; result: string }>) {
      const c = configs.find((x) => x.id === e.configuration_id)!;
      expect(verdict(c, e.criterion_id).verdict, `${e.configuration_id} ${e.criterion_id}`).toBe(e.result);
    }
  });

  it("cites the curve point it read head from", () => {
    const r = verdict(bg, "head-at-duty");
    expect(r.measured).toEqual({ value: 99.5, unit: "ft" });
    expect(r.margin).toBe(19.5);
    expect(r.source?.excerpts).toEqual(["cfg-bg-e1510-125bc-950-1750 at 60 gpm: head 99.5 ft, efficiency 54 %, NPSHr 7 ft"]);
    expect(r.source?.source_id).toBe("bg-e1510-curve");
  });

  it("abstains when the margin is inside the reading error", () => {
    // B&G efficiency 54 % vs ≥ 52 %: margin 2 points equals the ±2 point reading error.
    const r = verdict(bg, "pump-efficiency-at-duty");
    expect(r.verdict).toBe("UNKNOWN");
    expect(r.reason).toContain("within the reading error");
  });

  it("reports every motor criterion UNKNOWN when the submittal lists no motor", () => {
    for (const id of ["motor-power", "motor-voltage", "motor-phase", "motor-frequency"]) {
      const r = verdict(taco, id);
      expect(r.verdict).toBe("UNKNOWN");
      expect(r.missing).toContain("motor");
    }
  });

  it("never reports PASS for a field it has no evidence for", () => {
    for (const c of configs) for (const r of pump.evaluate(reqs, c)) if (!r.source) expect(r.verdict).not.toBe("PASS");
  });

  it("evaluates motor data once supplied", () => {
    const withMotor = { ...bg, motor: { rated_power_hp: 5, volts: [208, 230, 460], phase: 3, hz: 60 } };
    for (const id of ["motor-power", "motor-voltage", "motor-phase", "motor-frequency"]) expect(verdict(withMotor, id).verdict).toBe("PASS");
    expect(verdict({ ...withMotor, motor: { ...withMotor.motor, hz: 50 } }, "motor-frequency").verdict).toBe("FAIL");
  });

  it("returns UNKNOWN instead of extrapolating past the digitized flow range", () => {
    const r = pump.evaluate({ ...reqs, duty_point: { ...reqs.duty_point, flow_gpm: 90 } }, bg).find((x) => x.criterion_id === "head-at-duty")!;
    expect(r.verdict).toBe("UNKNOWN");
    expect(r.reason).toContain("not extrapolated");
  });

  it("interpolates between points and marks the value derived", () => {
    const v = curveValueAt(bg, "head_ft", 65)!;
    expect(v.exact).toBe(false);
    expect(v.excerpts).toHaveLength(2);
    expect(v.value).toBeGreaterThan(96.5);
    expect(v.value).toBeLessThan(99.5);
  });

  it("converts units before comparing", () => {
    const metric: RequirementSet = { ...reqs, duty_point: { flow_m3h: 60 * 0.227124707 }, criteria: [{ id: "h", predicate: { field: "head_at_duty", operator: "GTE", value: 24, unit: "m" }, mandatory: true, evidence_needed: "", source_refs: [] }] };
    const r = pump.evaluate(metric, bg)[0]!;
    expect(r.verdict).toBe("PASS"); // 99.5 ft = 30.3 m
    expect(r.margin).toBeCloseTo(6.33, 1);
  });
});

describe("affinity laws", () => {
  it("scales flow by k, head by k² and power by k³", () => {
    const [p] = affinity([{ flow_gpm: 60, head_ft: 100, power_hp: 4 }], 0.9);
    expect(p!.flow_gpm).toBeCloseTo(54);
    expect(p!.head_ft).toBeCloseTo(81);
    expect(p!.power_hp).toBeCloseTo(2.916);
  });
});
