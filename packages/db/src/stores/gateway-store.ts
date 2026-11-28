import { and, asc, eq, gt, gte, isNull, lte, or, sql } from "drizzle-orm";
import type { DB } from "../client.js";
import { approvals, subjectRevisions } from "../schema/incidents.js";
import { actionReceipts } from "../schema/runtime.js";

export type ActionClass = "READ" | "DRAFT" | "EXTERNAL_WRITE" | "BINDING";
export type ActionStatus =
  | "PENDING"
  | "DISPATCHING"
  | "CONFIRMED"
  | "UNCERTAIN"
  | "FAILED";
export type ApprovalRole =
  | "OPERATOR"
  | "PROCUREMENT_MANAGER"
  | "ENGINEER_OF_RECORD"
  | "PROJECT_MANAGER";

export interface RevisionPins {
  requirement_rev?: string;
  config_rev?: string;
  offer_rev?: string;
  plan_rev?: string;
  schedule_rev?: string;
}

export interface ApprovalRecord {
  approval_id: string;
  granted_by: string;
  granted_role: ApprovalRole;
  granted_at: Date;
  expires_at: Date;
  pins: RevisionPins;
  scope: string;
  subject_id: string;
}

export interface ActionReceiptRecord {
  receipt_id: string;
  action_id: string;
  idempotency_key: string;
  status: ActionStatus;
  action_type: string;
  action_class: ActionClass;
  incident_id: string | null;
  subject_id: string | null;
  actor: string;
  reason: string;
  arguments: Record<string, unknown>;
  tainted_arguments: string[];
  approval_id: string | null;
  recipient: string | null;
  template_id: string | null;
  dispatched_at: Date | null;
  confirmed_at: Date | null;
  external_id: string | null;
  error: string | null;
  lease_expires_at: Date | null;
  retry_count: number;
  created_at: Date;
}

export type NewReceiptRecord = Omit<
  ActionReceiptRecord,
  "receipt_id" | "created_at"
>;

export type InsertOutcome =
  | { inserted: true; receipt_id: string }
  | { inserted: false; reason: "DUPLICATE"; existing: ActionReceiptRecord }
  | { inserted: false; reason: "RATE_LIMITED" };

export interface RateLimit {
  recipient: string;
  since: Date;
  max: number;
}

export interface Claim {
  receipt: ActionReceiptRecord;
  recovered: boolean;
}

export interface GatewayTx {
  getValidApproval(
    approvalId: string,
    now: Date,
  ): Promise<ApprovalRecord | null>;
  currentRevisions(subjectId: string): Promise<RevisionPins | null>;
  getReceiptByKey(idempotencyKey: string): Promise<ActionReceiptRecord | null>;
  insertReceipt(
    receipt: NewReceiptRecord,
    rateLimit?: RateLimit,
  ): Promise<InsertOutcome>;
  claim(
    receiptId: string,
    now: Date,
    leaseExpiresAt: Date,
  ): Promise<Claim | null>;
  markConfirmed(receiptId: string, externalId: string): Promise<void>;
  markUncertain(receiptId: string, error: string): Promise<void>;
  markFailed(receiptId: string, error: string): Promise<void>;
}

type DrizzleTx = Parameters<Parameters<DB["transaction"]>[0]>[0];

function toRevisionPins(row: {
  requirementRev: string | null;
  configRev: string | null;
  offerRev: string | null;
  planRev: string | null;
  scheduleRev: string | null;
}): RevisionPins {
  const pins: RevisionPins = {};
  if (row.requirementRev !== null) pins.requirement_rev = row.requirementRev;
  if (row.configRev !== null) pins.config_rev = row.configRev;
  if (row.offerRev !== null) pins.offer_rev = row.offerRev;
  if (row.planRev !== null) pins.plan_rev = row.planRev;
  if (row.scheduleRev !== null) pins.schedule_rev = row.scheduleRev;
  return pins;
}

function toActionReceipt(
  row: typeof actionReceipts.$inferSelect,
): ActionReceiptRecord {
  return {
    receipt_id: row.receiptId,
    action_id: row.actionId,
    idempotency_key: row.idempotencyKey,
    status: row.status as ActionStatus,
    action_type: row.actionType,
    action_class: row.actionClass as ActionClass,
    incident_id: row.incidentId,
    subject_id: row.subjectId,
    actor: row.actor,
    reason: row.reason,
    arguments: row.arguments,
    tainted_arguments: row.taintedArguments,
    approval_id: row.approvalId,
    recipient: row.recipient,
    template_id: row.templateId,
    dispatched_at: row.dispatchedAt,
    confirmed_at: row.confirmedAt,
    external_id: row.externalId,
    error: row.error,
    lease_expires_at: row.leaseExpiresAt,
    retry_count: row.retryCount,
    created_at: row.createdAt,
  };
}

class PostgresGatewayTx implements GatewayTx {
  constructor(
    private readonly tx: DrizzleTx,
    private readonly clock: () => Date,
  ) {}

  async getValidApproval(
    approvalId: string,
    now: Date,
  ): Promise<ApprovalRecord | null> {
    const [row] = await this.tx
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.id, approvalId),
          eq(approvals.outcome, "GRANTED"),
          isNull(approvals.invalidatedAt),
          gt(approvals.expiresAt, now),
        ),
      )
      .for("share");

    if (!row) return null;

    return {
      approval_id: row.id,
      granted_by: row.grantedBy,
      granted_role: row.grantedRole as ApprovalRole,
      granted_at: row.grantedAt,
      expires_at: row.expiresAt,
      pins: toRevisionPins(row),
      scope: row.scope,
      subject_id: row.subjectId,
    };
  }

  async currentRevisions(subjectId: string): Promise<RevisionPins | null> {
    const [row] = await this.tx
      .select()
      .from(subjectRevisions)
      .where(eq(subjectRevisions.subjectId, subjectId))
      .for("share");

    return row ? toRevisionPins(row) : null;
  }

  async getReceiptByKey(
    idempotencyKey: string,
  ): Promise<ActionReceiptRecord | null> {
    const [row] = await this.tx
      .select()
      .from(actionReceipts)
      .where(eq(actionReceipts.idempotencyKey, idempotencyKey))
      .limit(1);

    return row ? toActionReceipt(row) : null;
  }

  async insertReceipt(
    receipt: NewReceiptRecord,
    rateLimit?: RateLimit,
  ): Promise<InsertOutcome> {
    const existing = await this.getReceiptByKey(receipt.idempotency_key);
    if (existing) {
      return { inserted: false, reason: "DUPLICATE", existing };
    }

    if (rateLimit) {
      // Serialize concurrent outbound rate-limit checks per recipient.
      await this.tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${rateLimit.recipient}))`,
      );
      const [countRow] = await this.tx
        .select({ count: sql<number>`count(*)::int` })
        .from(actionReceipts)
        .where(
          and(
            eq(actionReceipts.recipient, rateLimit.recipient),
            gte(actionReceipts.createdAt, rateLimit.since),
          ),
        );
      if ((countRow?.count ?? 0) >= rateLimit.max) {
        return { inserted: false, reason: "RATE_LIMITED" };
      }
    }

    const inserted = await this.tx
      .insert(actionReceipts)
      .values({
        actionId: receipt.action_id,
        idempotencyKey: receipt.idempotency_key,
        status: receipt.status,
        actionType: receipt.action_type,
        actionClass: receipt.action_class,
        incidentId: receipt.incident_id,
        subjectId: receipt.subject_id,
        actor: receipt.actor,
        reason: receipt.reason,
        arguments: receipt.arguments,
        taintedArguments: receipt.tainted_arguments,
        approvalId: receipt.approval_id,
        recipient: receipt.recipient,
        templateId: receipt.template_id,
        dispatchedAt: receipt.dispatched_at,
        confirmedAt: receipt.confirmed_at,
        externalId: receipt.external_id,
        error: receipt.error,
        leaseExpiresAt: receipt.lease_expires_at,
        retryCount: receipt.retry_count,
        createdAt: this.clock(),
      })
      .onConflictDoNothing({ target: actionReceipts.idempotencyKey })
      .returning({ receiptId: actionReceipts.receiptId });

    const created = inserted[0];
    if (!created) {
      const raced = await this.getReceiptByKey(receipt.idempotency_key);
      if (!raced) {
        throw new Error(
          `Failed to insert or reload receipt for key ${receipt.idempotency_key}`,
        );
      }
      return { inserted: false, reason: "DUPLICATE", existing: raced };
    }

    return { inserted: true, receipt_id: created.receiptId };
  }

  async claim(
    receiptId: string,
    now: Date,
    leaseExpiresAt: Date,
  ): Promise<Claim | null> {
    const [current] = await this.tx
      .select()
      .from(actionReceipts)
      .where(eq(actionReceipts.receiptId, receiptId))
      .for("update");

    if (!current) return null;

    const stranded =
      current.status === "DISPATCHING" &&
      current.leaseExpiresAt !== null &&
      current.leaseExpiresAt <= now;

    if (current.status !== "PENDING" && !stranded) {
      return null;
    }

    const [updated] = await this.tx
      .update(actionReceipts)
      .set({
        status: "DISPATCHING",
        leaseExpiresAt,
        dispatchedAt: now,
        retryCount: sql`${actionReceipts.retryCount} + 1`,
      })
      .where(eq(actionReceipts.receiptId, receiptId))
      .returning();

    if (!updated) return null;

    return {
      receipt: toActionReceipt(updated),
      recovered: stranded,
    };
  }

  async markConfirmed(receiptId: string, externalId: string): Promise<void> {
    await this.tx
      .update(actionReceipts)
      .set({
        status: "CONFIRMED",
        externalId,
        confirmedAt: this.clock(),
        leaseExpiresAt: null,
      })
      .where(eq(actionReceipts.receiptId, receiptId));
  }

  async markUncertain(receiptId: string, error: string): Promise<void> {
    await this.tx
      .update(actionReceipts)
      .set({
        status: "UNCERTAIN",
        error,
        leaseExpiresAt: null,
      })
      .where(eq(actionReceipts.receiptId, receiptId));
  }

  async markFailed(receiptId: string, error: string): Promise<void> {
    await this.tx
      .update(actionReceipts)
      .set({
        status: "FAILED",
        error,
        leaseExpiresAt: null,
      })
      .where(eq(actionReceipts.receiptId, receiptId));
  }
}

/**
 * PostgreSQL-backed GatewayStore for ExecutionGateway.
 * Structurally satisfies GatewayStore from @pactline/execution-gateway without importing it.
 */
export class PostgresGatewayStore {
  constructor(
    private readonly db: DB,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async transaction<T>(fn: (tx: GatewayTx) => Promise<T>): Promise<T> {
    return this.db.transaction(async (pgTx) =>
      fn(new PostgresGatewayTx(pgTx, this.clock)),
    );
  }

  async listDispatchable(limit: number, now: Date): Promise<string[]> {
    const rows = await this.db
      .select({ receiptId: actionReceipts.receiptId })
      .from(actionReceipts)
      .where(
        or(
          eq(actionReceipts.status, "PENDING"),
          and(
            eq(actionReceipts.status, "DISPATCHING"),
            lte(actionReceipts.leaseExpiresAt, now),
          ),
        ),
      )
      .orderBy(asc(actionReceipts.createdAt))
      .limit(limit);

    return rows.map((r) => r.receiptId);
  }
}
