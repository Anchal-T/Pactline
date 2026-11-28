import { describe, expect, it } from "vitest";
import { runScenarios } from "../harness.js";
import { promptInjection } from "./injection.js";
import { parallelPoLineContention } from "./world.js";

describe("scenario 11", () => {
  it("is PENDING with its blocker when TEST_DATABASE_URL is unset, and never falls back to DATABASE_URL", async () => {
    const scenario = parallelPoLineContention({ DATABASE_URL: "postgres://app@main.example/db" });
    expect(scenario).toEqual({
      id: 11,
      title: "Parallel incidents contending on the same POLine",
      blockedBy: "Needs TEST_DATABASE_URL pointing at an isolated Neon branch (ANC-60)",
    });
  });

  it("refuses a TEST_DATABASE_URL that targets the application database", async () => {
    const url = "postgres://u:p@ep-x.neon.tech:5432/neondb";
    const saved = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://u:p@ep-x-pooler.neon.tech:5432/neondb";
    try {
      const report = await runScenarios([parallelPoLineContention({ TEST_DATABASE_URL: url })]);
      expect(report.results[0]).toMatchObject({ outcome: "FAILED", error: "TEST_DATABASE_URL must target a dedicated test database, not DATABASE_URL" });
    } finally {
      if (saved === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = saved;
    }
  });

  it.runIf(process.env.TEST_DATABASE_URL)("passes against the real ProcurementRepo on the isolated database", async () => {
    const report = await runScenarios([parallelPoLineContention()]);
    expect(report.results[0]!.checks.filter((c) => !c.passed)).toEqual([]);
    expect(report.results[0]!.outcome).toBe("PASSED");
  }, 60_000);
});

/**
 * Open kernel bypasses found by scenario 12. The gateway and validator fixes belong to their packages; when one lands,
 * remove its line here and the scenario must still pass the rest.
 */
const KNOWN_BYPASSES: string[] = [];

describe("scenario 12", () => {
  it("passes every check against the real kernel modules except the open bypasses", async () => {
    const result = (await runScenarios([promptInjection])).results[0]!;
    expect(result.error).toBeUndefined();
    expect(result.checks.filter((c) => !c.passed).map((c) => c.description)).toEqual(KNOWN_BYPASSES);
    expect(result.outcome).toBe(KNOWN_BYPASSES.length ? "FAILED" : "PASSED");
  });
});
