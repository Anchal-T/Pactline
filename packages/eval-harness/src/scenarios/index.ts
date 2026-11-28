// The 12 mandatory Phase 4 scenarios (AGENTS.md §6). Scenarios whose kernel
// components exist run against the real modules; the rest are registered as
// PENDING with the component and Linear issue that unblocks them.
import { IncidentStateMachine } from "@pactline/domain";
import { CentrifugalPumpModule } from "@pactline/equipment-module";
import { IncidentRuntime, MemoryEventStore } from "@pactline/incident-runtime";
import { analyzeDelay } from "@pactline/schedule-engine";
import { OFFER, PINS, SUBJECT, sandboxGateway, substitution } from "../fixtures/execution.js";
import { CLOSE, REOPEN, mitigated, verifying } from "../fixtures/incident.js";
import { BELL_AND_GOSSETT, TACO, PUMP_REQUIREMENTS, REQ } from "../fixtures/pump-candidates.js";
import { PUMP_SCHEDULE, activity } from "../fixtures/pump-schedule.js";
import { vendorCommitment } from "../fixtures/vendor-events.js";
import { type Scenario, check } from "../harness.js";
import { crashAfterExternalWrite, supplierSilenceEscalation } from "./durable.js";
import { promptInjection } from "./injection.js";
import { parallelPoLineContention } from "./world.js";

const findingFor = (report: ReturnType<typeof CentrifugalPumpModule.evaluate>, id: string) =>
  report.findings.find((f) => f.requirementId === id);

const BEFORE_OFFER_EXPIRY = new Date(OFFER.expiresAt.getTime() - 14 * 3_600_000);
const AFTER_OFFER_EXPIRY = new Date(OFFER.expiresAt.getTime() + 9 * 3_600_000);

/** Enqueue a substitution, run the outbox, and report the receipt state and the writes that reached the vendor. */
async function enqueueAndDispatch(
  env: Awaited<ReturnType<typeof sandboxGateway>>,
  actionId: string,
  beforeDispatch?: () => Promise<void>,
) {
  const auth = await env.gateway.enqueue(substitution(actionId));
  await beforeDispatch?.();
  await env.gateway.tickOutbox();
  const receipt = auth.receipt_id ? env.store.receipts.get(auth.receipt_id) : undefined;
  return { auth, status: receipt?.status, error: receipt?.error ?? null, writes: env.adapter.getOperationCount() };
}

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
    run: async () => {
      const clock = { now: () => new Date("2026-12-14T10:00:00Z") };
      // v2 (slip to 2027-01-07) arrives first; the older v1 email is delivered late, then v2 is redelivered.
      const store = new MemoryEventStore();
      const runtime = new IncidentRuntime(clock, store);
      const newer = await runtime.ingestEvent(vendorCommitment(2));
      const older = await runtime.ingestEvent(vendorCommitment(1));
      const redelivery = await runtime.ingestEvent(vendorCommitment(2));
      // Control: delivered in order, both revisions are recorded.
      const inOrder = new MemoryEventStore();
      const control = new IncidentRuntime(clock, inOrder);
      await control.ingestEvent(vendorCommitment(1));
      const laterRevision = await control.ingestEvent(vendorCommitment(2));
      return [
        check("newer revision is stored", newer, { success: true, event_id: vendorCommitment(2).event_id }),
        check("older revision arriving later is rejected as out_of_order", older.out_of_order, true),
        check("exact redelivery of the newer revision is a duplicate", redelivery.duplicate, true),
        check("only the newer revision is in the event log", store.events.map((e) => e.source_version), [2]),
        check("stored commitment carries the newer arrival date", store.events[0]?.payload.revised_arrival_date, "2027-01-07"),
        check("vendor-supplied arrival date stays tainted", store.events[0]?.tainted_fields.includes("payload.revised_arrival_date"), true),
        check("control: in-order newer revision is stored", laterRevision, { success: true, event_id: vendorCommitment(2).event_id }),
        check("control: both in-order revisions are logged", inOrder.events.map((e) => e.source_version), [1, 2]),
      ];
    },
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
    run: async () => {
      // Substitution proposed after the offer expired. The approval is still valid, so only the offer check stops it.
      const late = await enqueueAndDispatch(await sandboxGateway(AFTER_OFFER_EXPIRY), "act-sub-late");
      // Enqueued while valid, but the outbox only reaches it after the offer expires.
      const lapsed = await sandboxGateway(BEFORE_OFFER_EXPIRY);
      const stranded = await enqueueAndDispatch(lapsed, "act-sub-stranded", async () => lapsed.setNow(AFTER_OFFER_EXPIRY));
      const valid = await enqueueAndDispatch(await sandboxGateway(BEFORE_OFFER_EXPIRY), "act-sub-valid");
      return [
        check("enqueue after expiry is not authorized", late.auth.authorized, false),
        check("rejection names the expired offer", late.auth.error, `Supplier offer ${PINS.offer_rev} expired at ${OFFER.expiresAt.toISOString()}`),
        check("no receipt is written after expiry", late.auth.receipt_id, undefined),
        check("expired offer causes 0 adapter writes", late.writes, 0),
        check("receipt that lapses before dispatch is FAILED", stranded.status, "FAILED"),
        check("enqueue inside the offer validity was authorized", stranded.auth.authorized, true),
        check(
          "dispatch rejection cites the expired offer",
          stranded.error,
          `Approval no longer valid at dispatch: Supplier offer ${PINS.offer_rev} expired at ${OFFER.expiresAt.toISOString()}`,
        ),
        check("lapsed receipt causes 0 adapter writes", stranded.writes, 0),
        check("control: substitution inside the offer validity is CONFIRMED", valid.status, "CONFIRMED"),
        check("control: valid offer makes exactly 1 write", valid.writes, 1),
      ];
    },
  },
  {
    id: 6,
    title: "Spec or offer revision invalidating a prior approval",
    run: async () => {
      // The supplier revised its offer after the engineer approved revision r1.
      const offerRevised = await enqueueAndDispatch(
        await sandboxGateway(BEFORE_OFFER_EXPIRY, { ...PINS, offer_rev: "offer-bg-e1510-r2" }),
        "act-sub-offer-rev",
      );
      // The requirement set is revised between enqueue and dispatch.
      const env = await sandboxGateway(BEFORE_OFFER_EXPIRY);
      const specRevised = await enqueueAndDispatch(env, "act-sub-spec-rev", () =>
        env.store.setRevisions(SUBJECT, { ...PINS, requirement_rev: "reqset-chwp-r4" }),
      );
      const valid = await enqueueAndDispatch(await sandboxGateway(BEFORE_OFFER_EXPIRY), "act-sub-current");
      return [
        check("stale offer pin is not authorized", offerRevised.auth.authorized, false),
        check("rejection names the drifted offer revision", offerRevised.auth.error, "Approval pins offer_rev=offer-bg-e1510-r1, current is offer-bg-e1510-r2"),
        check("stale offer pin causes 0 adapter writes", offerRevised.writes, 0),
        check("spec-revised receipt was accepted before the revision", specRevised.auth.authorized, true),
        check("spec revision fails the receipt at dispatch", specRevised.status, "FAILED"),
        check(
          "dispatch rejection names the drifted requirement revision",
          specRevised.error,
          "Approval no longer valid at dispatch: Approval pins requirement_rev=reqset-chwp-r3, current is reqset-chwp-r4",
        ),
        check("spec revision causes 0 adapter writes", specRevised.writes, 0),
        check("control: current pins are CONFIRMED", valid.status, "CONFIRMED"),
        check("control: current pins make exactly 1 write", valid.writes, 1),
      ];
    },
  },
  crashAfterExternalWrite,
  supplierSilenceEscalation,
  {
    id: 9,
    title: "Partial acceptance (accepted_qty < required_qty blocks closure)",
    run: () => {
      const partial = IncidentStateMachine.transition(verifying(1), CLOSE);
      const waiverOnly = IncidentStateMachine.transition({ ...verifying(1), has_valid_waiver: true }, CLOSE);
      const waived = IncidentStateMachine.transition(
        { ...verifying(1), has_valid_waiver: true, has_schedule_disposition: true },
        CLOSE,
      );
      const full = IncidentStateMachine.transition(verifying(2), CLOSE);
      return [
        check("1 of 2 accepted cannot close", partial.success, false),
        check("partial incident stays VERIFYING", [partial.from_status, partial.to_status], ["VERIFYING", undefined]),
        check("partial incident version is not advanced", partial.new_version, undefined),
        check("rejection cites the closure invariant", partial.error, "CLOSED requires accepted_qty >= required_qty OR valid waiver + schedule disposition"),
        check("waiver without schedule disposition cannot close", waiverOnly.success, false),
        check("waiver with schedule disposition closes", waived.to_status, "CLOSED"),
        check("control: 2 of 2 accepted closes", [full.success, full.to_status], [true, "CLOSED"]),
        check("control: closing advances the version", full.new_version, 8),
      ];
    },
  },
  {
    id: 10,
    title: "Post-mitigation delay -> reopen incident from MITIGATED",
    run: () => {
      // The mitigated delivery slips 3 workdays and hits the critical path.
      const slip = analyzeDelay(PUMP_SCHEDULE, { activityId: activity("delivery"), forecastFinishDate: "2026-12-31" });
      const reopened = IncidentStateMachine.transition(mitigated(), REOPEN);
      const unowned = IncidentStateMachine.transition(mitigated(), { ...REOPEN, owner: undefined });
      const closed = IncidentStateMachine.transition({ ...verifying(2), status: "CLOSED" }, REOPEN);
      const afterReopen = {
        status: "INVESTIGATING" as const,
        owner: REOPEN.owner ?? null,
        next_action: REOPEN.next_action ?? null,
        next_review_at: REOPEN.next_review_at ?? null,
      };
      return [
        check("post-mitigation slip is CRITICAL", slip.impact, "CRITICAL"),
        check("MITIGATED incident reopens to INVESTIGATING", [reopened.success, reopened.from_status, reopened.to_status], [true, "MITIGATED", "INVESTIGATING"]),
        check("reopen advances the version", reopened.new_version, 7),
        check("reopened incident satisfies invariant 8", IncidentStateMachine.validateInvariant8(afterReopen), null),
        check("reopen without an owner is refused", unowned.error, "INVESTIGATING requires an owner"),
        check("control: a CLOSED incident cannot reopen", closed.error, "Invalid transition from CLOSED to INVESTIGATING"),
      ];
    },
  },
  parallelPoLineContention(),
  promptInjection,
];
