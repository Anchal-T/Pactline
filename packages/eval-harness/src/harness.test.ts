import { describe, expect, it } from "vitest";
import { SCENARIOS, check, runScenarios } from "./index.js";

describe("Phase 4 scenarios", () => {
  const report = runScenarios(SCENARIOS);
  const byId = (id: number) => report.results.find((r) => r.id === id)!;

  it("registers all 12 mandatory scenarios exactly once", () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it.each([1, 3, 4])("scenario %i passes against the real kernel modules", (id) => {
    const result = byId(id);
    expect(result.checks.filter((c) => !c.passed)).toEqual([]);
    expect(result.outcome).toBe("PASSED");
  });

  it("reports unbuilt scenarios as PENDING with their blocker, not as passed", () => {
    for (const id of [2, 5, 6, 7, 8, 9, 10, 11, 12]) {
      expect(byId(id).outcome).toBe("PENDING");
      expect(byId(id).blockedBy).toMatch(/ANC-\d+/);
    }
    expect(report).toMatchObject({ passed: 3, failed: 0, pending: 9, complete: false });
  });
});

describe("runScenarios", () => {
  it("fails a scenario when any check fails", () => {
    const report = runScenarios([
      { id: 1, title: "t", run: () => [check("ok", 1, 1), check("bad", { a: 1 }, { a: 2 })] },
    ]);
    expect(report.results[0]!.outcome).toBe("FAILED");
    expect(report.failed).toBe(1);
  });

  it("fails a scenario that makes no checks", () => {
    expect(runScenarios([{ id: 1, title: "t", run: () => [] }]).results[0]!.outcome).toBe("FAILED");
  });

  it("fails a scenario that throws, recording the error", () => {
    const result = runScenarios([
      {
        id: 1,
        title: "t",
        run: () => {
          throw new Error("boom");
        },
      },
    ]).results[0]!;
    expect(result).toMatchObject({ outcome: "FAILED", error: "boom" });
  });

  it("is complete only when every scenario runs and passes", () => {
    expect(runScenarios([{ id: 1, title: "t", run: () => [check("ok", [1], [1])] }]).complete).toBe(true);
  });
});
