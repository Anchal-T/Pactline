import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { IncidentId, IncidentState, IncidentStatus, SpecialistResult, SpecialistRole, StatePin, TaskId } from "@pactline/domain";
import type { DB } from "../client.js";
import { approvals, incidentAuditEvents, incidents, subjectRevisions } from "../schema/incidents.js";
import { actionReceipts, incidentActionProposals, specialistTasks } from "../schema/runtime.js";
import { PostgresGatewayStore, type ActionClass, type ActionReceiptRecord } from "./gateway-store.js";

/*
 * Postgres implementation of the @pactline/incident-runtime storage ports (IncidentQueue, TaskQueue,
 * ReceiptReader), following the SQL contract documented in that package's ports.ts. These classes structurally
 * satisfy the ports without importing them, as PostgresGatewayStore does for ExecutionGateway.
 *
 * Every timestamp written or compared is the caller's `now` (the runtime Clock), never the database's now().
 */

export type SchedulerLeaseToken = string & { readonly _brand: "LeaseToken" };

export interface SchedulerLease<T> {
  readonly row: T;
  readonly token: SchedulerLeaseToken;
  readonly owner: string;
  readonly expires_at: Date;
  readonly version: number;
}

export type SchedulerCommitOutcome = "COMMITTED" | "LEASE_LOST";

export type SchedulerIncident = Omit<IncidentState, "id" | "version"> & {
  id: IncidentId;
  follow_ups: number;
  failures: number;
};

/** Mirrors ExecutionGateway's ActionProposal. */
export interface ActionProposalRecord {
  action_id: string;
  action_type: string;
  action_class?: ActionClass;
  incident_id: string | null;
  actor: string;
  reason: string;
  subject_id?: string;
  approval_id?: string;
  arguments: Record<string, unknown>;
  tainted_arguments?: string[];
  recipient?: string;
  template_id?: string;
  metadata?: Record<string, unknown>;
}

export interface ActionHandoff {
  receipt_id: string | null;
  error: string | null;
}

type IncidentRow = typeof incidents.$inferSelect;

const PIN_KEYS = ["requirement_rev", "config_rev", "offer_rev", "plan_rev", "schedule_rev"] as const;

export class PostgresIncidentQueue {
  constructor(private readonly db: DB) {}

  /** One statement: lease up to `limit` due incidents, skipping rows another worker is claiming. */
  async claimDue(owner: string, now: Date, leaseMs: number, limit: number): Promise<SchedulerLease<SchedulerIncident>[]> {
    const expires = new Date(now.getTime() + leaseMs);
    const due = this.db
      .select({ id: incidents.id })
      .from(incidents)
      .where(
        and(
          ne(incidents.status, "CLOSED"),
          lte(incidents.nextReviewAt, now),
          or(isNull(incidents.leaseExpiresAt), lte(incidents.leaseExpiresAt, now)),
        ),
      )
      .orderBy(asc(incidents.nextReviewAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    const rows = await this.db
      .update(incidents)
      .set({ leaseHolder: owner, leaseToken: sql`gen_random_uuid()`, leaseExpiresAt: expires })
      .where(inArray(incidents.id, due))
      .returning();
    if (rows.length === 0) return [];

    const grants = await this.db
      .select()
      .from(approvals)
      .where(
        and(
          inArray(approvals.incidentId, rows.map((r) => r.id)),
          eq(approvals.outcome, "GRANTED"),
          isNull(approvals.invalidatedAt),
        ),
      );
    return rows
      .sort((a, b) => a.nextReviewAt!.getTime() - b.nextReviewAt!.getTime())
      .map((row) => ({
        row: toIncident(row, grants.filter((g) => g.incidentId === row.id), now),
        token: row.leaseToken as SchedulerLeaseToken,
        owner,
        expires_at: expires,
        version: row.version,
      }));
  }

  /** Compare-and-set on lease token, lease expiry and version; the decided actions are recorded in the same transaction. */
  async commit(
    lease: SchedulerLease<SchedulerIncident>,
    now: Date,
    next: SchedulerIncident,
    actions: readonly ActionProposalRecord[],
  ): Promise<SchedulerCommitOutcome> {
    return this.db.transaction(async (tx) => {
      const updated = await tx
        .update(incidents)
        .set({
          status: next.status,
          owner: next.owner,
          nextAction: next.next_action,
          blocker: next.blocker,
          nextReviewAt: next.next_review_at,
          followUps: next.follow_ups,
          reviewFailures: next.failures,
          version: sql`${incidents.version} + 1`,
          leaseHolder: null,
          leaseToken: null,
          leaseExpiresAt: null,
          updatedAt: now,
          closedAt: next.status === "CLOSED" ? now : null,
        })
        .where(
          and(
            eq(incidents.id, lease.row.id),
            eq(incidents.leaseToken, lease.token),
            gt(incidents.leaseExpiresAt, now),
            eq(incidents.version, lease.version),
          ),
        )
        .returning({ id: incidents.id });
      if (updated.length === 0) return "LEASE_LOST";

      if (actions.length > 0) {
        await tx
          .insert(incidentActionProposals)
          .values(
            actions.map((a) => ({
              actionId: a.action_id,
              incidentId: lease.row.id,
              proposal: a as unknown as Record<string, unknown>,
              recordedAt: now,
            })),
          )
          .onConflictDoNothing({ target: incidentActionProposals.actionId });
      }
      if (next.status !== lease.row.status) {
        await tx.insert(incidentAuditEvents).values({
          incidentId: lease.row.id,
          eventType: "STATUS_TRANSITION",
          fromStatus: lease.row.status,
          toStatus: next.status,
          actor: lease.owner,
          reason: next.blocker ?? next.next_action ?? "Scheduled review",
          occurredAt: now,
        });
      }
      return "COMMITTED";
    });
  }

  async pendingActions(limit: number): Promise<ActionProposalRecord[]> {
    const rows = await this.db
      .select({ proposal: incidentActionProposals.proposal })
      .from(incidentActionProposals)
      .where(isNull(incidentActionProposals.handedOffAt))
      .orderBy(asc(incidentActionProposals.recordedAt), asc(incidentActionProposals.actionId))
      .limit(limit);
    return rows.map((r) => r.proposal as unknown as ActionProposalRecord);
  }

  async markHandedOff(actionId: string, now: Date, handoff: ActionHandoff): Promise<boolean> {
    const rows = await this.db
      .update(incidentActionProposals)
      .set({ handedOffAt: now, receiptId: handoff.receipt_id, error: handoff.error })
      .where(and(eq(incidentActionProposals.actionId, actionId), isNull(incidentActionProposals.handedOffAt)))
      .returning({ actionId: incidentActionProposals.actionId });
    return rows.length > 0;
  }
}

/** The approval flags are derived the same way IncidentRepo.transitionIncident derives them. */
function toIncident(row: IncidentRow, grants: (typeof approvals.$inferSelect)[], now: Date): SchedulerIncident {
  const live = grants.filter((g) => g.expiresAt > now);
  return {
    id: row.id as IncidentId,
    status: row.status as IncidentStatus,
    owner: row.owner,
    next_action: row.nextAction,
    blocker: row.blocker,
    next_review_at: row.nextReviewAt,
    accepted_qty: Number(row.acceptedQty),
    required_qty: Number(row.requiredQty),
    has_valid_waiver: live.some((g) => g.id === row.waiverApprovalId && g.scope === "accept_waiver" && g.grantedRole === "PROJECT_MANAGER"),
    has_schedule_disposition: row.scheduleDisposition !== null,
    has_valid_approval: live.length > 0,
    approval_expired: grants.length > 0 && live.length === 0,
    follow_ups: row.followUps,
    failures: row.reviewFailures,
  };
}

export type SchedulerTaskStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "STALE" | "FAILED";

export interface SchedulerTask {
  id: TaskId;
  incident_id: IncidentId;
  specialist: SpecialistRole;
  input: unknown;
  pin: StatePin;
  status: SchedulerTaskStatus;
  attempts: number;
  available_at: Date;
  result: SpecialistResult | null;
  error: string | null;
}

export type SchedulerTaskOutcome =
  | { kind: "RESULT"; result: SpecialistResult }
  | { kind: "STALE"; result: SpecialistResult; reason: string }
  | { kind: "RETRY"; error: string; retry_at: Date }
  | { kind: "FAILED"; error: string };

const TASK_STATUS = { QUEUED: "PENDING", RUNNING: "CLAIMED", COMPLETED: "COMPLETED", STALE: "STALE", FAILED: "FAILED" } as const;

export class PostgresTaskQueue {
  constructor(private readonly db: DB) {}

  /** Due: PENDING with available_at <= now, or CLAIMED by a worker whose lease expired. */
  async claim(owner: string, now: Date, leaseMs: number, limit: number): Promise<SchedulerLease<SchedulerTask>[]> {
    const expires = new Date(now.getTime() + leaseMs);
    const due = this.db
      .select({ id: specialistTasks.taskId })
      .from(specialistTasks)
      .where(
        and(
          isNotNull(specialistTasks.incidentId),
          or(isNull(specialistTasks.leaseExpiresAt), lte(specialistTasks.leaseExpiresAt, now)),
          or(
            and(eq(specialistTasks.status, TASK_STATUS.QUEUED), lte(specialistTasks.availableAt, now)),
            eq(specialistTasks.status, TASK_STATUS.RUNNING),
          ),
        ),
      )
      .orderBy(asc(specialistTasks.availableAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    const rows = await this.db
      .update(specialistTasks)
      .set({
        status: TASK_STATUS.RUNNING,
        attemptCount: sql`${specialistTasks.attemptCount} + 1`,
        leaseHolder: owner,
        leaseToken: sql`gen_random_uuid()`,
        leaseExpiresAt: expires,
      })
      .where(inArray(specialistTasks.taskId, due))
      .returning();
    return rows
      .sort((a, b) => a.availableAt.getTime() - b.availableAt.getTime())
      .map((row) => ({
        row: {
          id: row.taskId as TaskId,
          incident_id: row.incidentId as IncidentId,
          specialist: row.role as SpecialistRole,
          input: row.inputPayload,
          pin: row.statePin as StatePin,
          status: "RUNNING",
          attempts: row.attemptCount,
          available_at: row.availableAt,
          result: row.resultEnvelope as SpecialistResult | null,
          error: row.error,
        },
        token: row.leaseToken as SchedulerLeaseToken,
        owner,
        expires_at: expires,
        version: row.version,
      }));
  }

  /**
   * CAS on the lease. A RESULT is checked against the pin subject's current revisions, read FOR SHARE in the
   * same transaction so a concurrent revision bump either lands first (STALE) or waits for this commit.
   */
  async complete(lease: SchedulerLease<SchedulerTask>, now: Date, outcome: SchedulerTaskOutcome): Promise<SchedulerTaskStatus | "LEASE_LOST"> {
    return this.db.transaction(async (tx) => {
      let next: { status: SchedulerTaskStatus; result?: SpecialistResult; error: string | null; availableAt?: Date };
      switch (outcome.kind) {
        case "RESULT": {
          const drift = await this.pinDrift(tx, lease.row.id, lease.row.pin);
          next = drift ? { status: "STALE", result: outcome.result, error: drift } : { status: "COMPLETED", result: outcome.result, error: null };
          break;
        }
        case "STALE":
          next = { status: "STALE", result: outcome.result, error: outcome.reason };
          break;
        case "RETRY":
          next = { status: "QUEUED", error: outcome.error, availableAt: outcome.retry_at };
          break;
        case "FAILED":
          next = { status: "FAILED", error: outcome.error };
          break;
      }
      const updated = await tx
        .update(specialistTasks)
        .set({
          status: TASK_STATUS[next.status],
          error: next.error,
          ...(next.result ? { resultEnvelope: next.result as unknown as Record<string, unknown> } : {}),
          ...(next.availableAt ? { availableAt: next.availableAt } : {}),
          completedAt: next.status === "QUEUED" ? null : now,
          version: sql`${specialistTasks.version} + 1`,
          leaseHolder: null,
          leaseToken: null,
          leaseExpiresAt: null,
        })
        .where(
          and(
            eq(specialistTasks.taskId, lease.row.id),
            eq(specialistTasks.leaseToken, lease.token),
            gt(specialistTasks.leaseExpiresAt, now),
            eq(specialistTasks.version, lease.version),
          ),
        )
        .returning({ id: specialistTasks.taskId });
      return updated.length === 0 ? "LEASE_LOST" : next.status;
    });
  }

  /** Null when every pinned revision is still current. A pin that cannot be checked counts as drifted. */
  private async pinDrift(tx: DrizzleTx, taskId: string, pin: StatePin): Promise<string | null> {
    const [task] = await tx.select({ subjectId: specialistTasks.pinSubjectId }).from(specialistTasks).where(eq(specialistTasks.taskId, taskId));
    if (!task?.subjectId) return "Task pin names no subject to verify against";
    const [current] = await tx.select().from(subjectRevisions).where(eq(subjectRevisions.subjectId, task.subjectId)).for("share");
    if (!current) return `No current revisions for ${task.subjectId}`;
    const revs: Record<(typeof PIN_KEYS)[number], string | null> = {
      requirement_rev: current.requirementRev,
      config_rev: current.configRev,
      offer_rev: current.offerRev,
      plan_rev: current.planRev,
      schedule_rev: current.scheduleRev,
    };
    for (const [key, value] of Object.entries(pin)) {
      if (value === undefined) continue;
      if (!(PIN_KEYS as readonly string[]).includes(key)) return `Pinned ${key} is not a tracked revision`;
      const held = revs[key as (typeof PIN_KEYS)[number]];
      if (held !== String(value)) return `Pinned ${key}=${value}, current is ${held ?? "none"}`;
    }
    return null;
  }
}

type DrizzleTx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export class PostgresReceiptReader {
  private readonly gateway: PostgresGatewayStore;

  constructor(private readonly db: DB) {
    this.gateway = new PostgresGatewayStore(db);
  }

  /** Receipts for the incident that ended UNCERTAIN or FAILED, mapped by the gateway store. */
  async unresolved(incidentId: IncidentId): Promise<ActionReceiptRecord[]> {
    const keys = await this.db
      .select({ key: actionReceipts.idempotencyKey })
      .from(actionReceipts)
      .where(and(eq(actionReceipts.incidentId, incidentId), inArray(actionReceipts.status, ["UNCERTAIN", "FAILED"])))
      .orderBy(asc(actionReceipts.createdAt));
    if (keys.length === 0) return [];
    return this.gateway.transaction(async (tx) => {
      const receipts: ActionReceiptRecord[] = [];
      for (const { key } of keys) {
        const receipt = await tx.getReceiptByKey(key);
        if (receipt) receipts.push(receipt);
      }
      return receipts;
    });
  }
}
