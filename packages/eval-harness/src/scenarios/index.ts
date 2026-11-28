// The 12 mandatory Phase 4 scenarios (AGENTS.md §6). Scenarios whose kernel
// components exist run against the real modules; the rest are registered as
// PENDING with the component and Linear issue that unblocks them.
import { CentrifugalPumpModule } from "@pactline/equipment-module";
import { analyzeDelay } from "@pactline/schedule-engine";
import { BELL_AND_GOSSETT, TACO, PUMP_REQUIREMENTS, REQ } from "../fixtures/pump-candidates.js";
import { PUMP_SCHEDULE, activity } from "../fixtures/pump-schedule.js";
import { type Scenario, check } from "../harness.js";

const findingFor = (report: ReturnType<typeof CentrifugalPumpModule.evaluate>, id: string) =>
  report.findings.find((f) => f.requirementId === id);

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 1,
    title: "Float-absorbed non-critical delay (no false critical escalation)",
    run: () => {
      // Site prep slips 3 workdays (finish 12-09 -> 12-14) but has 13 days of float.
      const absorbed = analyzeDelay(PUMP_SCHEDULE, {
        activityId: activity("sitePrep"),
        forecastFinishDate: "2026-12-14",
      });
      // Control: a 3-workday slip on the critical delivery must still escalate.
      const critical = analyzeDelay(PUMP_SCHEDULE, {
        activityId: activity("delivery"),
        forecastFinishDate: "2026-12-31",
      });
      return [
        check("non-critical delay is classified FLOAT_ABSORBED", absorbed.impact, "FLOAT_ABSORBED"),
        check("critical path is not reported as affected", absorbed.criticalPathAffected, false),
        check("project finish does not move", absorbed.projectFinish.slipWorkdays, 0),
        check("float consumed equals the slip", absorbed.floatConsumedWorkdays, 3),
        check("float remaining before the need date", absorbed.remainingFloatWorkdays, 10),
        check("only the delayed activity moves", absorbed.delayedActivities.map((s) => s.activityId), [
          activity("sitePrep"),
        ]),
        check("control: same slip on the critical delivery is CRITICAL", critical.impact, "CRITICAL"),
        check("control: handover moves to 2027-01-14", critical.projectFinish.projected, "2027-01-14"),
      ];
    },
  },
  {
    id: 2,
    title: "Stale / out-of-order vendor update",
    blockedBy: "WorldStore append-only VendorCommitment history (ANC-31) and event ingress ordering rules (ANC-34)",
  },
  {
    id: 3,
    title: "Mandatory pump-curve head failure (FAIL)",
    run: () => {
      const report = CentrifugalPumpModule.evaluate(PUMP_REQUIREMENTS, TACO);
      const head = findingFor(report, REQ.head);
      const control = CentrifugalPumpModule.evaluate(PUMP_REQUIREMENTS, BELL_AND_GOSSETT);
      return [
        check("Taco head at 60 US gpm is FAIL", head?.result, "FAIL"),
        check("head requirement is mandatory", head?.mandatory, true),
        check("37 ft converted to meters at duty flow", head?.observed, 11.278),
        check("finding cites the manufacturer curve", head?.evidenceRefs, [TACO.curve?.evidenceRef]),
        check("mandatory FAIL makes the configuration NON_COMPLIANT", report.status, "NON_COMPLIANT"),
        check("control: Bell & Gossett head is PASS", findingFor(control, REQ.head)?.result, "PASS"),
        check("control: selected motor evidence is still missing", control.status, "INCOMPLETE"),
      ];
    },
  },
  {
    id: 4,
    title: "Missing motor/curve evidence (UNKNOWN, never PASS)",
    run: () => {
      const noMotor = CentrifugalPumpModule.evaluate(PUMP_REQUIREMENTS, BELL_AND_GOSSETT);
      const noCurve = CentrifugalPumpModule.evaluate(PUMP_REQUIREMENTS, { ...BELL_AND_GOSSETT, curve: undefined });
      return [
        check("motor voltage is UNKNOWN without selected motor data", findingFor(noMotor, REQ.motorVoltage)?.result, "UNKNOWN"),
        check("UNKNOWN motor finding cites no evidence", findingFor(noMotor, REQ.motorVoltage)?.evidenceRefs, []),
        check("configuration with missing motor data is INCOMPLETE", noMotor.status, "INCOMPLETE"),
        check("head is UNKNOWN without a curve", findingFor(noCurve, REQ.head)?.result, "UNKNOWN"),
        check("pump efficiency is UNKNOWN without a curve", findingFor(noCurve, REQ.efficiency)?.result, "UNKNOWN"),
        check("configuration with no curve is INCOMPLETE", noCurve.status, "INCOMPLETE"),
      ];
    },
  },
  {
    id: 5,
    title: "Expired supplier offer rejected before execution",
    blockedBy: "ExecutionGateway offer-expiry check inside the enqueue transaction (ANC-35)",
  },
  {
    id: 6,
    title: "Spec or offer revision invalidating a prior approval",
    blockedBy: "WorldStore approval pinning/invalidation (ANC-31) and ExecutionGateway re-verification (ANC-35)",
  },
  {
    id: 7,
    title: "Process crash after external write (reconcile -> 0 duplicate writes)",
    blockedBy: "ExecutionGateway outbox + SandboxExternalAdapter reconcile (ANC-35) and durable scheduler (ANC-59)",
  },
  {
    id: 8,
    title: "Supplier silence timeout -> bounded follow-up -> escalation",
    blockedBy: "IncidentRuntime ticks with VirtualClock (ANC-59) and incident state machine (ANC-33)",
  },
  {
    id: 9,
    title: "Partial acceptance (accepted_qty < required_qty blocks closure)",
    blockedBy: "Incident state machine closure invariant (ANC-33)",
  },
  {
    id: 10,
    title: "Post-mitigation delay -> reopen incident from MITIGATED",
    blockedBy: "Incident state machine reopen transition (ANC-33)",
  },
  {
    id: 11,
    title: "Parallel incidents contending on the same POLine",
    blockedBy: "WorldStore FulfillmentAllocation locking on an isolated Neon branch (ANC-31)",
  },
  {
    id: 12,
    title: "Prompt injection in vendor email/submittal PDF (0 unauthorized writes or bypassed checks)",
    blockedBy: "AgentWorkers extraction (ANC-37, ANC-40) and headless agent E2E evaluation (ANC-61)",
  },
];
