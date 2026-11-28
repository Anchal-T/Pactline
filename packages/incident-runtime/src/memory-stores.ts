import { IncidentStateMachine, type IncidentId, type StatePin } from "@pactline/domain";
import type { ActionProposal, ActionReceipt, MemoryGatewayStore } from "@pactline/execution-gateway";
import {
  type AuditEntry,
  type AuditSink,
  type CommitOutcome,
  type Handoff,
  type IncidentQueue,
  type IncidentRecord,
  type Lease,
  type LeaseToken,
  pinsMatch,
  type ReceiptReader,
  type TaskOutcome,
  type TaskQueue,
  type TaskRecord,
  type TaskStatus,
} from "./ports.js";

interface Row<T> {
  value: T;
  version: number;
  lease: { token: LeaseToken; owner: string; expires_at: Date } | null;
}

/**
 * Rows with a lease and a version, enforcing the claim and commit contract in ./ports.ts. Atomic because nothing
 * awaits between a check and its write, which is what the single Postgres statement gives the real store.
 */
export class MemoryLeaseTable<T extends { id: string }> {
  private readonly rows = new Map<string, Row<T>>();
  private seq = 0;

  /** Any write outside a lease bumps the version, so a holder that read the old row cannot commit over it. */
  put(value: T): void {
    const row = this.rows.get(value.id);
    this.rows.set(value.id, { value: structuredClone(value), version: (row?.version ?? 0) + 1, lease: row?.lease ?? null });
  }

  get(id: string): T | undefined {
    const row = this.rows.get(id);
    return row && structuredClone(row.value);
  }

  claim(owner: string, now: Date, leaseMs: number, limit: number, due: (v: T) => boolean, order: (a: T, b: T) => number, onClaim: (v: T) => T = (v) => v): Lease<T>[] {
    const free = [...this.rows.values()].filter((r) => (!r.lease || r.lease.expires_at <= now) && due(r.value));
    return free
      .sort((a, b) => order(a.value, b.value))
      .slice(0, limit)
      .map((r) => {
        r.value = onClaim(r.value);
        r.lease = { token: `lease-${++this.seq}` as LeaseToken, owner, expires_at: new Date(now.getTime() + leaseMs) };
        return { row: structuredClone(r.value), token: r.lease.token, owner, expires_at: r.lease.expires_at, version: r.version };
      });
  }

  commit(lease: Lease<T>, now: Date, next: T): CommitOutcome {
    const row = this.rows.get(lease.row.id);
    if (!row?.lease || row.lease.token !== lease.token || row.lease.expires_at <= now || row.version !== lease.version) return "LEASE_LOST";
    this.rows.set(lease.row.id, { value: structuredClone(next), version: row.version + 1, lease: null });
    return "COMMITTED";
  }
}

interface ActionRow {
  action: ActionProposal;
  handoff: (Handoff & { at: Date }) | null;
}

export class MemoryIncidentQueue implements IncidentQueue {
  private readonly table = new MemoryLeaseTable<IncidentRecord>();
  /** The proposals table: insertion order is recording order, and a repeated action_id is ignored. */
  readonly actions = new Map<string, ActionRow>();

  put(incident: IncidentRecord): void {
    this.assertInvariant8(incident);
    this.table.put(incident);
  }

  get(id: IncidentId): IncidentRecord | undefined {
    return this.table.get(id);
  }

  async claimDue(owner: string, now: Date, leaseMs: number, limit: number): Promise<Lease<IncidentRecord>[]> {
    return this.table.claim(
      owner,
      now,
      leaseMs,
      limit,
      (i) => i.status !== "CLOSED" && i.next_review_at !== null && i.next_review_at <= now,
      (a, b) => a.next_review_at!.getTime() - b.next_review_at!.getTime(),
    );
  }

  async commit(lease: Lease<IncidentRecord>, now: Date, next: IncidentRecord, actions: readonly ActionProposal[]): Promise<CommitOutcome> {
    this.assertInvariant8(next);
    const outcome = this.table.commit(lease, now, next);
    if (outcome === "COMMITTED") {
      for (const action of actions) if (!this.actions.has(action.action_id)) this.actions.set(action.action_id, { action: structuredClone(action), handoff: null });
    }
    return outcome;
  }

  async pendingActions(limit: number): Promise<ActionProposal[]> {
    return [...this.actions.values()].filter((r) => !r.handoff).slice(0, limit).map((r) => structuredClone(r.action));
  }

  async markHandedOff(actionId: string, now: Date, handoff: Handoff): Promise<boolean> {
    const row = this.actions.get(actionId);
    if (!row || row.handoff) return false;
    row.handoff = { ...handoff, at: now };
    return true;
  }

  /** The DB CHECK constraint (invariant 8), mirrored. */
  private assertInvariant8(incident: IncidentRecord): void {
    const error = IncidentStateMachine.validateInvariant8(incident);
    if (error) throw new Error(`Invariant 8 violated for ${incident.id}: ${error}`);
  }
}

export class MemoryTaskQueue implements TaskQueue {
  private readonly table = new MemoryLeaseTable<TaskRecord>();

  /** `currentPin` stands in for the revision tables the Postgres store reads inside the completion transaction. */
  constructor(private readonly currentPin: (task: TaskRecord) => StatePin = (task) => task.pin) {}

  put(task: TaskRecord): void {
    this.table.put(task);
  }

  get(id: string): TaskRecord | undefined {
    return this.table.get(id);
  }

  async claim(owner: string, now: Date, leaseMs: number, limit: number): Promise<Lease<TaskRecord>[]> {
    return this.table.claim(
      owner,
      now,
      leaseMs,
      limit,
      (t) => (t.status === "QUEUED" && t.available_at <= now) || t.status === "RUNNING",
      (a, b) => a.available_at.getTime() - b.available_at.getTime(),
      (t) => ({ ...t, status: "RUNNING", attempts: t.attempts + 1 }),
    );
  }

  async complete(lease: Lease<TaskRecord>, now: Date, outcome: TaskOutcome): Promise<TaskStatus | "LEASE_LOST"> {
    const task = lease.row;
    const next = ((): TaskRecord => {
      switch (outcome.kind) {
        case "RESULT": {
          const current = pinsMatch(this.currentPin(task), task.pin);
          return { ...task, status: current ? "COMPLETED" : "STALE", result: outcome.result, error: current ? null : "Input revisions drifted before completion" };
        }
        case "STALE":
          return { ...task, status: "STALE", result: outcome.result, error: outcome.reason };
        case "RETRY":
          return { ...task, status: "QUEUED", available_at: outcome.retry_at, error: outcome.error };
        case "FAILED":
          return { ...task, status: "FAILED", error: outcome.error };
      }
    })();
    return this.table.commit(lease, now, next) === "COMMITTED" ? next.status : "LEASE_LOST";
  }
}

export class MemoryReceiptReader implements ReceiptReader {
  constructor(private readonly store: MemoryGatewayStore) {}

  async unresolved(incidentId: IncidentId): Promise<ActionReceipt[]> {
    return [...this.store.receipts.values()].filter((r) => r.incident_id === incidentId && (r.status === "UNCERTAIN" || r.status === "FAILED"));
  }
}

export class MemoryAuditLog implements AuditSink {
  readonly entries: AuditEntry[] = [];

  async record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}
