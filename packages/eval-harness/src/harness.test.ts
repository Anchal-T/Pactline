import { beforeAll, describe, expect, it } from "vitest";
import type { EvalReport } from "./harness.js";
import { SCENARIOS, check, runScenarios } from "./index.js";

describe("Phase 4 scenarios", () => {
  let report: EvalReport;
  beforeAll(async () => {
    report = await runScenarios(SCENARIOS);
  });
  const byId = (id: number) => report.results.find((r) => r.id === id)!;

  it("registers all 12 mandatory scenarios exactly once", () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])("scenario %i passes against the real kernel modules", (id) => {
    const result = byId(id);
    expect(result.checks.filter((c) => !c.passed)).toEqual([]);
    expect(result.outcome).toBe("PASSED");
  });

  it("reports unbuilt scenarios as PENDING with their blocker, not as passed", () => {
    for (const id of [11, 12]) {
      expect(byId(id).outcome).toBe("PENDING");
      expect(byId(id).blockedBy).toMatch(/ANC-\d+/);
    }
    expect(report).toMatchObject({ passed: 10, failed: 0, pending: 2, complete: false });
  });
});

describe("runScenarios", () => {
  it("fails a scenario when any check fails", async () => {
    const report = await runScenarios([
      { id: 1, title: "t", run: () => [check("ok", 1, 1), check("bad", { a: 1 }, { a: 2 })] },
    ]);
    expect(report.results[0]!.outcome).toBe("FAILED");
    expect(report.failed).toBe(1);
  });

  it("fails a scenario that makes no checks", async () => {
    expect((await runScenarios([{ id: 1, title: "t", run: () => [] }])).results[0]!.outcome).toBe("FAILED");
  });

  it("fails a scenario that throws, recording the error", async () => {
    const result = (await runScenarios([
      {
        id: 1,
        title: "t",
        run: () => {
          throw new Error("boom");
        },
      },
    ])).results[0]!;
    expect(result).toMatchObject({ outcome: "FAILED", error: "boom" });
  });

  it("fails a scenario whose async run rejects", async () => {
    const result = (await runScenarios([{ id: 1, title: "t", run: () => Promise.reject(new Error("late boom")) }])).results[0]!;
    expect(result).toMatchObject({ outcome: "FAILED", error: "late boom" });
  });

  it("is complete only when all 12 required scenario IDs pass exactly once", async () => {
    const passing = SCENARIOS.map(({ id, title }) => ({ id, title, run: () => [check("ok", true, true)] }));
    expect((await runScenarios(passing)).complete).toBe(true);
    expect((await runScenarios([])).complete).toBe(false);
    expect((await runScenarios(passing.slice(0, 11))).complete).toBe(false);
    expect((await runScenarios([...passing.slice(1), passing[1]!])).complete).toBe(false);
    expect((await runScenarios([...passing, { ...passing[0]!, id: 13 }])).complete).toBe(false);
  });
});
