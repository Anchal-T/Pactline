// Prints the scenario report. Exits 1 if any runnable scenario fails; PENDING does not fail the run.
import { type CheckResult, runScenarios } from "./harness.js";
import { SCENARIOS } from "./scenarios/index.js";

const report = runScenarios(SCENARIOS);
const show = (value: unknown) => JSON.stringify(value);

for (const result of report.results) {
  console.log(`${result.outcome.padEnd(7)} #${String(result.id).padStart(2)}  ${result.title}`);
  if (result.blockedBy) console.log(`          blocked by: ${result.blockedBy}`);
  if (result.error) console.log(`          error: ${result.error}`);
  for (const c of result.checks.filter((x: CheckResult) => !x.passed)) {
    console.log(`          ✗ ${c.description}: expected ${show(c.expected)}, got ${show(c.actual)}`);
  }
}
console.log(
  `\n${report.passed} passed, ${report.failed} failed, ${report.pending} pending — ` +
    (report.complete ? "all scenarios pass" : "gate not met (UI work stays blocked)"),
);
process.exitCode = report.failed > 0 ? 1 : 0;
