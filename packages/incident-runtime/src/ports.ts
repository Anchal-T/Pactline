import { canonicalJson, type IncidentId, type IncidentState, type SpecialistResult, type SpecialistRole, type StatePin, type TaskId, type TransitionRequest } from "@pactline/domain";
import type { ActionProposal, ActionReceipt, ExecutionGateway } from "@pactline/execution-gateway";

/*
 * Storage ports for the durable scheduler. The Postgres WorldStore (ANC-31) implements them; the Memory* classes
 * in ./memory-stores.ts are the reference behaviour. Every claim and every commit is one short transaction, and no
 * transaction is ever open while a decider, a specialist or an external adapter runs.
 *
 * Claim (one statement):
 *   UPDATE t SET lease_owner = $owner, lease_token = gen_random_uuid(), lease_expires_at = $now + $leaseMs, ...
 *   WHERE id IN (SELECT id FROM t WHERE <due> AND (lease_expires_at IS NULL OR lease_expires_at <= $now)
 *                ORDER BY <due column> LIMIT $limit FOR UPDATE SKIP LOCKED)
 *   RETURNING *, version
 * SKIP LOCKED means two workers never block on, or both take, the same row. The claim does not bump `version`.
 *
 * Commit (compare-and-set):
 *   UPDATE t SET ..., version = version + 1, lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL
 *   WHERE id = $id AND lease_token = $token AND lease_expires_at > $now AND version = $version
 * Zero rows updated means the lease expired, was taken over, or the row changed underneath: LEASE_LOST, and the
 * caller only writes an audit entry. Any other write to the row (a new revision, a human edit) bumps `version`.
 * `$now` is always the injected Clock's time, never the database's, so VirtualClock tests stay deterministic.
 *
 * Action handoff (transactional outbox): an incident commit inserts its decided actions into a proposals table
 * in the same transaction (INSERT ... ON CONFLICT (action_id) DO NOTHING), so a crash after the commit cannot
 * lose them. Every tickIncidents drains rows WHERE handed_off_at IS NULL through ExecutionGateway.enqueue and then
 * stamps handed_off_at. A crash between enqueue and the stamp only causes a second enqueue of the same action_id,
 * which the gateway's idempotency key turns into the existing receipt.
 */

export const pinsMatch = (a: StatePin, b: StatePin): boolean => canonicalJson(a) === canonicalJson(b);

export type LeaseToken = string & { readonly _brand: "LeaseToken" };

export interface Lease<T> {
  /** The row as it stands after the claim. */
  readonly row: T;
  readonly token: LeaseToken;
  readonly owner: string;
  readonly expires_at: Date;
  /** Row version at claim time. */
  readonly version: number;
}

export type CommitOutcome = "COMMITTED" | "LEASE_LOST";

export type IncidentRecord = Omit<IncidentState, "id" | "version"> & {
  id: IncidentId;
  /** Follow-ups sent in the current status. Reset on every status change. */
  follow_ups: number;
  /** Consecutive reviews that produced no valid decision. */
  failures: number;
};

export interface IncidentQueue {
  /** Due: status <> 'CLOSED' AND next_review_at <= $now, oldest first. */
  claimDue(owner: string, now: Date, leaseMs: number, limit: number): Promise<Lease<IncidentRecord>[]>;
  /**
   * CAS as above, recording `actions` for handoff in the same transaction. `next` must satisfy the invariant-8
   * CHECK constraint, or the transaction fails and nothing is recorded.
   */
  commit(lease: Lease<IncidentRecord>, now: Date, next: IncidentRecord, actions: readonly ActionProposal[]): Promise<CommitOutcome>;
  /** Committed actions not yet handed to the gateway, oldest first. Includes ones left by a crashed worker. */
  pendingActions(limit: number): Promise<ActionProposal[]>;
  /** Stamps the handoff. False when another worker stamped it first. */
  markHandedOff(actionId: string, now: Date, handoff: Handoff): Promise<boolean>;
}

/** What the gateway said when the action was handed over: the receipt it queued, or why it refused. */
export interface Handoff {
  receipt_id: string | null;
  error: string | null;
}

export type TaskStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "STALE" | "FAILED";

export interface TaskRecord {
  id: TaskId;
  incident_id: IncidentId;
  specialist: SpecialistRole;
  input: unknown;
  /** Revisions the task must be answered against. */
  pin: StatePin;
  status: TaskStatus;
  /** Claims so far, including ones whose worker died. Incremented by the claim. */
  attempts: number;
  available_at: Date;
  result: SpecialistResult | null;
  error: string | null;
}

export type TaskOutcome =
  | { kind: "RESULT"; result: SpecialistResult }
  /** The worker answered against other revisions than the task's pin. Kept for audit only. */
  | { kind: "STALE"; result: SpecialistResult; reason: string }
  | { kind: "RETRY"; error: string; retry_at: Date }
  | { kind: "FAILED"; error: string };

export interface TaskQueue {
  /** Due: QUEUED with available_at <= $now, or RUNNING with an expired lease. Sets RUNNING, attempts + 1. */
  claim(owner: string, now: Date, leaseMs: number, limit: number): Promise<Lease<TaskRecord>[]>;
  /**
   * CAS as above. For RESULT, the same transaction reads the current revisions FOR SHARE and compares them with
   * `pin`: equal stores COMPLETED, drifted stores STALE (result kept, never executable). RETRY re-queues at retry_at.
   */
  complete(lease: Lease<TaskRecord>, now: Date, outcome: TaskOutcome): Promise<TaskStatus | "LEASE_LOST">;
}

export interface ReceiptReader {
  /** Receipts for the incident that ended UNCERTAIN or FAILED and so need a human. */
  unresolved(incidentId: IncidentId): Promise<ActionReceipt[]>;
}

export type AuditKind = "STALE_COMMIT" | "STALE_TASK_RESULT" | "DECISION_REJECTED" | "ACTION_REJECTED" | "ESCALATED";

export interface AuditEntry {
  at: Date;
  worker: string;
  kind: AuditKind;
  subject_id: string;
  detail: string;
}

export interface AuditSink {
  record(entry: AuditEntry): Promise<void>;
}

export type Outbox = Pick<ExecutionGateway, "authorize" | "enqueue" | "tickOutbox">;

/** An action the decider wants. The runtime assigns action_id and incident_id so retries share one idempotency key. */
export type ProposedAction = Omit<ActionProposal, "action_id" | "incident_id">;

export type Decision =
  | { kind: "HOLD"; next_review_at: Date; next_action?: string }
  | { kind: "TRANSITION"; request: TransitionRequest; actions?: ProposedAction[] }
  /** Chase the supplier and look again at next_review_at. The runtime escalates once the follow-up budget is spent. */
  | { kind: "FOLLOW_UP"; action: ProposedAction; next_review_at: Date };

/** Read-only judgement over one due incident. Deterministic script in tests, OperatorDecider (LLM) in production. */
export type Decider = (incident: IncidentRecord, now: Date) => Promise<Decision>;

export type SpecialistRunner = (task: TaskRecord) => Promise<SpecialistResult>;
