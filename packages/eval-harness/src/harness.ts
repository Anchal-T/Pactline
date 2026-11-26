import { isDeepStrictEqual } from "node:util";

export interface CheckResult {
  readonly description: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly passed: boolean;
}

export const check = (description: string, actual: unknown, expected: unknown): CheckResult => ({
  description,
  expected,
  actual,
  passed: isDeepStrictEqual(actual, expected),
});

interface ScenarioBase {
  readonly id: number;
  readonly title: string;
}

export interface RunnableScenario extends ScenarioBase {
  readonly run: () => readonly CheckResult[];
}

/** Registered but not yet runnable; names the missing component(s) and Linear issues. */
export interface PendingScenario extends ScenarioBase {
  readonly blockedBy: string;
}

export type Scenario = RunnableScenario | PendingScenario;

export type ScenarioOutcome = "PASSED" | "FAILED" | "PENDING";

export interface ScenarioResult {
  readonly id: number;
  readonly title: string;
  readonly outcome: ScenarioOutcome;
  readonly checks: readonly CheckResult[];
  readonly blockedBy?: string;
  readonly error?: string;
}

export interface EvalReport {
  readonly results: readonly ScenarioResult[];
  readonly passed: number;
  readonly failed: number;
  readonly pending: number;
  /** All 12 scenarios ran and passed: the gate for starting UI work. */
  readonly complete: boolean;
}

const MANDATORY_SCENARIO_IDS = Array.from({ length: 12 }, (_, index) => index + 1);

export function runScenarios(scenarios: readonly Scenario[]): EvalReport {
  const results = scenarios.map(runScenario);
  const count = (outcome: ScenarioOutcome) => results.filter((r) => r.outcome === outcome).length;
  const failed = count("FAILED");
  const pending = count("PENDING");
  const passed = count("PASSED");
  const passedIds = new Set(results.filter((result) => result.outcome === "PASSED").map((result) => result.id));
  const complete = results.length === MANDATORY_SCENARIO_IDS.length &&
    MANDATORY_SCENARIO_IDS.every((id) => passedIds.has(id));
  return { results, passed, failed, pending, complete };
}

function runScenario(scenario: Scenario): ScenarioResult {
  const base = { id: scenario.id, title: scenario.title };
  if (!("run" in scenario)) {
    return { ...base, outcome: "PENDING", checks: [], blockedBy: scenario.blockedBy };
  }
  try {
    const checks = scenario.run();
    const passed = checks.length > 0 && checks.every((c) => c.passed);
    return { ...base, outcome: passed ? "PASSED" : "FAILED", checks };
  } catch (error) {
    return { ...base, outcome: "FAILED", checks: [], error: error instanceof Error ? error.message : String(error) };
  }
}
