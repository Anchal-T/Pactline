// IncidentRuntime — ingestEvent (Phase 2D) and the durable scheduler ticks (ANC-59)
// Four stateless ticks driven by injected Clock per AGENTS.md §4

import { EventNormalizer, IncidentStateMachine, type IncidentStatus, type NormalizedEvent } from "@pactline/domain";
import type { ActionProposal } from "@pactline/execution-gateway";
import type { Clock } from "./clock.js";
import { pinsMatch, type AuditKind, type AuditSink, type Decider, type Decision, type IncidentQueue, type IncidentRecord, type Lease, type Outbox, type ProposedAction, type ReceiptReader, type SpecialistRunner, type TaskOutcome, type TaskQueue, type TaskRecord } from "./ports.js";

export { type Clock, RealClock, VirtualClock } from "./clock.js";

export type StoreOutcome = "stored" | "duplicate" | "out_of_order";

export interface EventKeys {
  /** Full source id, for exact redeliveries: "vendor-email:evt-001-v2". Null when the source gave no id. */
  dedupeKey: string | null;
  /** Shared by every revision of one source event: "vendor-email:evt-001". Null when the source gave no id. */
  seriesKey: string | null;
}

/**
 * Event storage interface. Actual implementation in @pactline/db.
 *
 * The duplicate check, the version comparison and the write are one operation: two overlapping deliveries must
 * not both be accepted, and an older revision must not land after a newer one. A database implementation does
 * this in one transaction (a unique index on dedupeKey plus a lock on the series), not as separate calls.
 */
export interface EventStore {
  storeIfNew(event: NormalizedEvent, keys: EventKeys): Promise<StoreOutcome>;
}

/** In-process store. Atomic because nothing awaits between the check and the write. For tests and local runs. */
export class MemoryEventStore implements EventStore {
  readonly events: NormalizedEvent[] = [];
  private readonly seen = new Set<string>();
  private readonly latestVersion = new Map<string, number>();

  async storeIfNew(event: NormalizedEvent, { dedupeKey, seriesKey }: EventKeys): Promise<StoreOutcome> {
    if (dedupeKey && this.seen.has(dedupeKey)) return "duplicate";
    if (seriesKey && event.source_version !== null) {
      const latest = this.latestVersion.get(seriesKey);
      if (latest !== undefined && event.source_version <= latest) return "out_of_order";
      this.latestVersion.set(seriesKey, event.source_version);
    }
    if (dedupeKey) this.seen.add(dedupeKey);
    this.events.push(event);
    return "stored";
  }
}

/**
 * Result of event ingestion
 */
export interface IngestionResult {
  success: boolean;
  event_id: string;
  duplicate?: boolean;
  out_of_order?: boolean;
  error?: string;
}

export interface SchedulerPolicy {
  leaseMs: number;
  batchSize: number;
  /** Follow-ups sent in one status before the incident escalates. */
  maxFollowUps: number;
  /** Consecutive reviews without a valid decision before the incident escalates. */
  maxReviewFailures: number;
  maxTaskAttempts: number;
  retryDelayMs: number;
  escalationOwner: string;
  escalationReviewMs: number;
}

export const DEFAULT_SCHEDULER_POLICY: SchedulerPolicy = {
  leaseMs: 60_000,
  batchSize: 10,
  maxFollowUps: 3,
  maxReviewFailures: 3,
  maxTaskAttempts: 3,
  retryDelayMs: 5 * 60_000,
  escalationOwner: "PROCUREMENT_MANAGER",
  escalationReviewMs: 4 * 3_600_000,
};

export interface SchedulerDeps {
  /** Lease owner recorded on every claim. Unique per process. */
  workerId: string;
  incidents: IncidentQueue;
  tasks: TaskQueue;
  outbox: Outbox;
  receipts: ReceiptReader;
  audit: AuditSink;
  decide: Decider;
  runTask: SpecialistRunner;
  policy?: Partial<SchedulerPolicy>;
}

/**
 * Incident Runtime
 *
 * Manages the incident lifecycle through four stateless ticks:
 * - ingestEvent: normalize + write event, trigger incident rules
 * - tickIncidents: advance open incidents (dispatch operator decisions)
 * - tickTasks: collect completed specialist task results
 * - tickOutbox: flush pending action_receipts via ExecutionGateway
 */
export class IncidentRuntime {
  private readonly policy: SchedulerPolicy;

  constructor(
    private readonly clock: Clock,
    private readonly eventStore: EventStore,
    private readonly scheduler: SchedulerDeps | null = null,
  ) {
    this.policy = { ...DEFAULT_SCHEDULER_POLICY, ...scheduler?.policy };
  }

  /**
   * Ingest a normalized event
   *
   * Phase 2D responsibilities:
   * - Deduplicate by (source, source_event_id)
   * - Handle out-of-order events by source_version
   * - Store event in append-only log
   * - Trigger incident rules (TODO: Phase 3)
   */
  async ingestEvent(event: NormalizedEvent): Promise<IngestionResult> {
    try {
      const outcome = await this.eventStore.storeIfNew(event, {
        dedupeKey: EventNormalizer.getDeduplicationKey(event),
        seriesKey: EventNormalizer.getSeriesKey(event),
      });
      if (outcome === "duplicate") return { success: true, event_id: event.event_id, duplicate: true };
      if (outcome === "out_of_order") return { success: true, event_id: event.event_id, out_of_order: true };

      // TODO Phase 3: Trigger incident rules based on event type
      // - VendorCommitmentChanged → update PO line forecast → recalculate impact → open/update incident
      // - ScheduleRevised → recompute need dates and float
      // - ApprovalGranted → transition incident from AWAITING_APPROVAL
      // - ShipmentReceived → transition to VERIFYING
      // etc.

      return {
        success: true,
        event_id: event.event_id,
      };
    } catch (err) {
      return {
        success: false,
        event_id: event.event_id,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Review every due incident (next_review_at <= now) this worker can lease. The decider runs outside any
   * transaction; its decision is checked against the state machine and invariant 8, then committed only if the
   * lease is still held and the row unchanged. The commit records the decided actions with the incident update;
   * they reach the gateway through the drain, which first picks up any a crashed worker committed but never queued.
   */
  async tickIncidents(): Promise<number> {
    const s = this.requireScheduler();
    await this.drainActions(s);
    const leases = await s.incidents.claimDue(s.workerId, this.clock.now(), this.policy.leaseMs, this.policy.batchSize);
    for (const lease of leases) await this.review(s, lease);
    await this.drainActions(s);
    return leases.length;
  }

  /**
   * Run claimed specialist tasks. A result answered against drifted revisions, or committed after the lease was
   * lost, is kept for audit only.
   */
  async tickTasks(): Promise<number> {
    const s = this.requireScheduler();
    const leases = await s.tasks.claim(s.workerId, this.clock.now(), this.policy.leaseMs, this.policy.batchSize);
    for (const lease of leases) await this.runTask(s, lease);
    return leases.length;
  }

  /** Dispatch queued actions. The gateway leases each receipt and reconciles a stranded one before any retry. */
  async tickOutbox(): Promise<void> {
    await this.requireScheduler().outbox.tickOutbox(this.policy.batchSize);
  }

  private requireScheduler(): SchedulerDeps {
    if (!this.scheduler) throw new Error("IncidentRuntime was built without scheduler dependencies");
    return this.scheduler;
  }

  private async review(s: SchedulerDeps, lease: Lease<IncidentRecord>): Promise<void> {
    const incident = lease.row;
    const now = this.clock.now();
    let plan: Plan;
    const unresolved = await s.receipts.unresolved(incident.id);
    if (unresolved.length > 0 && !HELD.includes(incident.status)) {
      const r = unresolved[0]!;
      plan = this.escalate(incident, now, `Action ${r.action_type} is ${r.status}: ${r.error ?? "no detail"}`);
    } else {
      try {
        plan = this.plan(incident, lease.version, await s.decide(structuredClone(incident), now), now);
      } catch (err) {
        plan = this.failure(incident, now, `Decider failed: ${errorMessage(err)}`);
      }
      plan = await this.preauthorize(s, incident, plan, now);
    }

    const outcome = await s.incidents.commit(lease, this.clock.now(), plan.next, plan.actions);
    if (outcome === "LEASE_LOST") {
      await this.audit(s, "STALE_COMMIT", incident.id, `Lease ${lease.token} lost before commit; decision discarded`);
      return;
    }
    for (const [kind, detail] of plan.notes) await this.audit(s, kind, incident.id, detail);
  }

  /**
   * Hand committed actions to the gateway until none are pending. Safe to repeat and to run from several workers:
   * action_ids are deterministic, so a second enqueue of the same action returns the existing receipt.
   */
  private async drainActions(s: SchedulerDeps): Promise<void> {
    for (;;) {
      const pending = await s.incidents.pendingActions(this.policy.batchSize);
      for (const action of pending) {
        const queued = await s.outbox.enqueue(action);
        const handoff = { receipt_id: queued.receipt_id ?? null, error: queued.authorized ? null : (queued.error ?? "Rejected") };
        const first = await s.incidents.markHandedOff(action.action_id, this.clock.now(), handoff);
        if (first && handoff.error) await this.audit(s, "ACTION_REJECTED", action.incident_id ?? action.action_id, `${action.action_id}: ${handoff.error}`);
      }
      if (pending.length < this.policy.batchSize) return;
    }
  }

  private plan(incident: IncidentRecord, version: number, decision: Decision, now: Date): Plan {
    const next = ((): Plan | string => {
      switch (decision.kind) {
        case "HOLD":
          return keep({ ...incident, failures: 0, next_review_at: decision.next_review_at, next_action: decision.next_action ?? incident.next_action });
        case "FOLLOW_UP": {
          if (incident.follow_ups >= this.policy.maxFollowUps) {
            return this.escalate(incident, now, `Supplier silent after ${incident.follow_ups} follow-ups`);
          }
          const n = incident.follow_ups + 1;
          return {
            next: { ...incident, failures: 0, follow_ups: n, next_review_at: decision.next_review_at, next_action: incident.next_action ?? "Await supplier response" },
            actions: [this.toProposal(incident, `follow-up:${n}`, decision.action)],
            notes: [],
          };
        }
        case "TRANSITION": {
          const { request } = decision;
          const result = IncidentStateMachine.transition({ ...incident, version }, request, now);
          if (!result.success) return result.error ?? "Transition rejected";
          return {
            next: {
              ...incident,
              status: request.to,
              owner: request.owner ?? incident.owner,
              next_action: request.next_action ?? null,
              blocker: request.blocker ?? null,
              next_review_at: request.next_review_at ?? null,
              follow_ups: 0,
              failures: 0,
            },
            actions: (decision.actions ?? []).map((a, i) => this.toProposal(incident, `v${version + 1}:${i}`, a)),
            notes: [],
          };
        }
      }
    })();
    if (typeof next === "string") return this.failure(incident, now, `Rejected decision: ${next}`);
    const violation = IncidentStateMachine.validateInvariant8(next.next);
    return violation ? this.failure(incident, now, `Rejected decision: ${violation}`) : next;
  }

  /** Advisory gateway check before commit, so a denied action escalates now instead of being dropped later. */
  private async preauthorize(s: SchedulerDeps, incident: IncidentRecord, plan: Plan, now: Date): Promise<Plan> {
    for (const action of plan.actions) {
      const auth = await s.outbox.authorize(action);
      if (!auth.authorized) return this.escalate(incident, now, `Action ${action.action_type} denied: ${auth.escalation_reason ?? auth.error}`);
    }
    return plan;
  }

  /** A review that produced nothing usable. Retried after a delay, escalated once the budget is spent. */
  private failure(incident: IncidentRecord, now: Date, reason: string): Plan {
    const failures = incident.failures + 1;
    if (failures >= this.policy.maxReviewFailures) return this.escalate(incident, now, `${failures} failed reviews; last: ${reason}`);
    return { ...keep({ ...incident, failures, next_review_at: this.after(now, this.policy.retryDelayMs) }), notes: [["DECISION_REJECTED", reason]] };
  }

  /** Hand the incident to a human: ESCALATED where the state machine allows it, else BLOCKED, else annotate in place. */
  private escalate(incident: IncidentRecord, now: Date, blocker: string): Plan {
    const status: IncidentStatus = (["ESCALATED", "BLOCKED"] as const).find((to) => IncidentStateMachine.isValidTransition(incident.status, to)) ?? incident.status;
    return {
      next: { ...incident, status, owner: this.policy.escalationOwner, blocker, next_review_at: this.after(now, this.policy.escalationReviewMs), follow_ups: 0, failures: 0 },
      actions: [],
      notes: [["ESCALATED", blocker]],
    };
  }

  private toProposal(incident: IncidentRecord, suffix: string, action: ProposedAction): ActionProposal {
    return { ...action, action_id: `${incident.id}:${suffix}`, incident_id: incident.id };
  }

  private async runTask(s: SchedulerDeps, lease: Lease<TaskRecord>): Promise<void> {
    const task = lease.row;
    const retryOrFail = (error: string): TaskOutcome =>
      task.attempts >= this.policy.maxTaskAttempts
        ? { kind: "FAILED", error: `${task.attempts} attempts; last: ${error}` }
        : { kind: "RETRY", error, retry_at: this.after(this.clock.now(), this.policy.retryDelayMs) };

    let outcome: TaskOutcome;
    if (task.attempts > this.policy.maxTaskAttempts) {
      outcome = { kind: "FAILED", error: `Retry budget spent after ${task.attempts - 1} attempts` };
    } else {
      try {
        const result = await s.runTask(structuredClone(task));
        if (result.status === "ERROR") outcome = retryOrFail("Specialist returned ERROR");
        else if (!pinsMatch(result.input_versions, task.pin)) outcome = { kind: "STALE", result, reason: "Specialist read other revisions than the task pin" };
        else outcome = { kind: "RESULT", result };
      } catch (err) {
        outcome = retryOrFail(errorMessage(err));
      }
    }

    const status = await s.tasks.complete(lease, this.clock.now(), outcome);
    if (status === "LEASE_LOST") await this.audit(s, "STALE_COMMIT", task.id, `Lease ${lease.token} lost; ${outcome.kind} discarded`);
    else if (status === "STALE") await this.audit(s, "STALE_TASK_RESULT", task.id, "Result kept for audit; input revisions drifted");
  }

  private audit(s: SchedulerDeps, kind: AuditKind, subjectId: string, detail: string): Promise<void> {
    return s.audit.record({ at: this.clock.now(), worker: s.workerId, kind, subject_id: subjectId, detail });
  }

  private after(now: Date, ms: number): Date {
    return new Date(now.getTime() + ms);
  }
}

/** Statuses already waiting on a human; an unresolved receipt does not re-escalate them. */
const HELD: readonly IncidentStatus[] = ["ESCALATED", "BLOCKED"];

interface Plan {
  next: IncidentRecord;
  actions: ActionProposal[];
  notes: Array<[AuditKind, string]>;
}

const keep = (next: IncidentRecord): Plan => ({ next, actions: [], notes: [] });

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));
