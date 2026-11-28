// ExecutionGateway — Phase 2E
// Deterministic RBAC + transactional outbox per AGENTS.md §4 and docs/04 §6

import { createHash } from "crypto";
import { canonicalJson } from "@pactline/domain";

/**
 * Action classes with different approval requirements
 */
export type ActionClass = "READ" | "DRAFT" | "EXTERNAL_WRITE" | "BINDING";

/**
 * Action status in the outbox
 */
export type ActionStatus = "PENDING" | "DISPATCHING" | "CONFIRMED" | "UNCERTAIN" | "FAILED";

/**
 * Required role for approvals
 */
export type ApprovalRole = "OPERATOR" | "PROCUREMENT_MANAGER" | "ENGINEER_OF_RECORD" | "PROJECT_MANAGER";

/** Revisions an approval is pinned to, and that a proposal is evaluated against. */
export interface RevisionPins {
  requirement_rev?: string;
  config_rev?: string;
  offer_rev?: string;
  plan_rev?: string;
  schedule_rev?: string;
}

/**
 * Trusted rule for one action type. The class, the role and the approval scope come from here,
 * never from the proposal, so a caller cannot relabel a binding change as a read.
 */
export interface ActionRule {
  class: ActionClass;
  /** BINDING: role the approval must be granted by. Also the role that may clear tainted arguments. */
  required_role?: ApprovalRole;
  /** Approval scope that authorizes this action. Defaults to the action type. */
  scope?: string;
  /** EXTERNAL_WRITE: needs an allow-listed recipient and a template. */
  outbound?: boolean;
}

export const DEFAULT_ACTION_RULES: Readonly<Record<string, ActionRule>> = {
  read_schedule: { class: "READ" },
  read_po: { class: "READ" },
  draft_rfq: { class: "DRAFT" },
  draft_vendor_email: { class: "DRAFT" },
  send_vendor_email: { class: "EXTERNAL_WRITE", outbound: true, required_role: "PROCUREMENT_MANAGER" },
  send_rfq: { class: "EXTERNAL_WRITE", outbound: true, required_role: "PROCUREMENT_MANAGER" },
  update_po: { class: "BINDING", required_role: "PROCUREMENT_MANAGER" },
  substitute_product: { class: "BINDING", required_role: "ENGINEER_OF_RECORD" },
  approve_submittal: { class: "BINDING", required_role: "ENGINEER_OF_RECORD", scope: "technical_acceptance" },
  accept_waiver: { class: "BINDING", required_role: "PROJECT_MANAGER" },
};

/** Argument keys that would let an outbound message carry an unchecked destination or template. */
const RESERVED_OUTBOUND_ARGS = ["recipient", "to", "cc", "bcc", "template_id", "template"];

/**
 * Action proposal from operator/specialist
 */
export interface ActionProposal {
  /** Stable id of the logical action: retries reuse it, a later action gets a new one. */
  action_id: string;
  action_type: string; // "send_vendor_email", "update_po", "send_rfq", etc.
  /** Optional. Ignored for authorization; a value that disagrees with the trusted rule is rejected. */
  action_class?: ActionClass;
  incident_id: string | null;
  actor: string;
  reason: string;

  /** What the action changes (PO line, submittal, offer). Required for BINDING actions. */
  subject_id?: string;
  approval_id?: string;

  // For taint policy
  arguments: Record<string, unknown>;
  tainted_arguments?: string[]; // List of argument keys that are tainted

  // Outbound messages: the only destination and template the adapter will use
  recipient?: string;
  template_id?: string;

  // Metadata
  metadata?: Record<string, unknown>;
}

/**
 * Approval record
 */
export interface Approval {
  approval_id: string;
  granted_by: string;
  granted_role: ApprovalRole;
  granted_at: Date;
  expires_at: Date;

  // Pinned revisions
  pins: RevisionPins;

  // What is approved
  scope: string; // "substitute_product", "expedite_po", "accept_waiver", etc.
  subject_id: string;
}

/**
 * Action receipt in the outbox
 */
export interface ActionReceipt {
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
  approval_id: string | null;

  // Outbound messages: the checked values the adapter must use
  recipient: string | null;
  template_id: string | null;

  // Execution tracking
  dispatched_at: Date | null;
  confirmed_at: Date | null;
  external_id: string | null;
  error: string | null;

  // For lease-based processing
  lease_expires_at: Date | null;
  retry_count: number;

  created_at: Date;
}

export type NewReceipt = Omit<ActionReceipt, "receipt_id" | "created_at">;

/**
 * Result of action authorization
 */
export interface AuthorizationResult {
  authorized: boolean;
  receipt_id?: string;
  idempotency_key?: string;
  error?: string;
  escalation_reason?: string;
}

/**
 * Result of action execution
 */
export interface ExecutionResult {
  success: boolean;
  external_id?: string;
  error?: string;
  uncertain?: boolean;
}

/**
 * External adapter interface for side effects
 */
export interface ExternalAdapter {
  /**
   * Execute an action (send email, update PO, etc.). For outbound messages it must use
   * receipt.recipient and receipt.template_id, never values found in receipt.arguments.
   */
  execute(action: ActionReceipt): Promise<ExecutionResult>;

  /**
   * Reconcile an uncertain action by checking external state
   * Returns external_id if found, null if safe to retry, throws if uncertain
   */
  reconcile(idempotencyKey: string): Promise<string | null>;
}

export type InsertOutcome =
  | { inserted: true; receipt_id: string }
  | { inserted: false; reason: "DUPLICATE"; existing: ActionReceipt }
  | { inserted: false; reason: "RATE_LIMITED" };

/**
 * Action receipt store interface
 */
export interface ActionReceiptStore {
  /**
   * Get existing receipt by idempotency key
   */
  getByIdempotencyKey(idempotencyKey: string): Promise<ActionReceipt | null>;

  /**
   * Insert a new PENDING receipt, atomically:
   * - a receipt with the same idempotency key wins (DUPLICATE), so concurrent enqueues create one row;
   * - with `rateLimit`, count outbound receipts to that recipient created since `since` and refuse
   *   (RATE_LIMITED) when `max` are already there. The count and the insert are one transaction,
   *   so the allowance is reserved by the insert itself.
   */
  insert(receipt: NewReceipt, rateLimit?: { recipient: string; since: Date; max: number }): Promise<InsertOutcome>;

  /**
   * Update receipt status to DISPATCHING with lease, incrementing retry_count
   */
  markDispatching(receiptId: string, leaseExpiresAt: Date): Promise<void>;

  /**
   * Update receipt status to CONFIRMED with external_id
   */
  markConfirmed(receiptId: string, externalId: string): Promise<void>;

  /**
   * Update receipt status to UNCERTAIN
   */
  markUncertain(receiptId: string, error: string): Promise<void>;

  /**
   * Update receipt status to FAILED
   */
  markFailed(receiptId: string, error: string): Promise<void>;

  /**
   * Get receipts ready for dispatch (PENDING, or DISPATCHING with expired lease)
   */
  getDispatchable(limit: number, now: Date): Promise<ActionReceipt[]>;
}

/**
 * Approval store interface
 */
export interface ApprovalStore {
  /**
   * Get approval by ID and check if still valid
   */
  getValid(approvalId: string, now: Date): Promise<Approval | null>;
}

/** Trusted source of the revisions currently in force for a subject (the world store). */
export interface RevisionReader {
  current(subjectId: string): Promise<RevisionPins | null>;
}

/**
 * Policy configuration
 */
export interface PolicyConfig {
  // Rate limits (per recipient per hour)
  externalWriteRateLimit: number;

  // Allowed recipients for external writes. Empty means no outbound write is allowed.
  allowedRecipients: string[];

  // Lease duration for dispatching actions (seconds)
  leaseDurationSeconds: number;

  // Max retries before escalation
  maxRetries: number;

  /** Trusted per-action rules. Unknown action types are rejected. */
  actionRules?: Record<string, ActionRule>;
}

export const DEFAULT_POLICY: PolicyConfig = {
  externalWriteRateLimit: 10,
  allowedRecipients: [],
  leaseDurationSeconds: 300, // 5 minutes
  maxRetries: 3,
};

export interface GatewayDeps {
  receipts: ActionReceiptStore;
  approvals: ApprovalStore;
  revisions: RevisionReader;
  adapter: ExternalAdapter;
  policy?: Partial<PolicyConfig>;
  clock?: () => Date;
}

type Denied = { ok: false; error: string; escalation: string };
type Check = { ok: true } | Denied;

const deny = (error: string, escalation: string): Denied => ({ ok: false, error, escalation });
const HOUR_MS = 3_600_000;
const PIN_KEYS: Array<keyof RevisionPins> = ["requirement_rev", "config_rev", "offer_rev", "plan_rev", "schedule_rev"];

/**
 * Execution Gateway
 *
 * Enforces:
 * - Invariant 2: No unauthorized technical/commercial action
 * - Invariant 4: No stale approval reuse
 * - Invariant 6: No blind retry on uncertain writes
 * - Taint policy: No tainted arguments to side effects without approval
 */
export class ExecutionGateway {
  private readonly receipts: ActionReceiptStore;
  private readonly approvals: ApprovalStore;
  private readonly revisions: RevisionReader;
  private readonly adapter: ExternalAdapter;
  private readonly policy: PolicyConfig;
  private readonly rules: Record<string, ActionRule>;
  private readonly clock: () => Date;

  constructor(deps: GatewayDeps) {
    this.receipts = deps.receipts;
    this.approvals = deps.approvals;
    this.revisions = deps.revisions;
    this.adapter = deps.adapter;
    this.policy = { ...DEFAULT_POLICY, ...deps.policy };
    this.rules = this.policy.actionRules ?? { ...DEFAULT_ACTION_RULES };
    this.clock = deps.clock ?? (() => new Date());
  }

  /**
   * Authorize an action proposal against the trusted rules, the current approval and policy.
   * Every call re-runs every check, including a retry of an action that already has a receipt.
   */
  async authorize(proposal: ActionProposal): Promise<AuthorizationResult> {
    const rule = this.rules[proposal.action_type];
    if (!rule) return this.fail(deny(`Unknown action type ${proposal.action_type}`, "No trusted rule for this action"));

    const check = await this.check(proposal, rule);
    if (!check.ok) return this.fail(check);

    const idempotencyKey = this.generateIdempotencyKey(proposal);
    const existing = await this.receipts.getByIdempotencyKey(idempotencyKey);
    if (existing?.status === "CONFIRMED") {
      return { authorized: false, error: "Action already confirmed", idempotency_key: idempotencyKey };
    }
    return { authorized: true, idempotency_key: idempotencyKey, receipt_id: existing?.receipt_id };
  }

  /**
   * Authorize and write the PENDING receipt. Outbound writes reserve the recipient's hourly
   * allowance in the same store operation as the insert.
   */
  async enqueue(proposal: ActionProposal): Promise<AuthorizationResult> {
    const auth = await this.authorize(proposal);
    if (!auth.authorized || auth.receipt_id) return auth;

    const rule = this.rules[proposal.action_type]!;
    const key = auth.idempotency_key!;
    const rateLimit =
      rule.outbound && proposal.recipient
        ? { recipient: proposal.recipient, since: new Date(this.clock().getTime() - HOUR_MS), max: this.policy.externalWriteRateLimit }
        : undefined;

    const outcome = await this.receipts.insert(this.toReceipt(proposal, rule, key), rateLimit);
    if (outcome.inserted) return { authorized: true, idempotency_key: key, receipt_id: outcome.receipt_id };
    if (outcome.reason === "DUPLICATE") {
      return outcome.existing.status === "CONFIRMED"
        ? { authorized: false, error: "Action already confirmed", idempotency_key: key }
        : { authorized: true, idempotency_key: key, receipt_id: outcome.existing.receipt_id };
    }
    return this.fail(deny(`Rate limit: ${this.policy.externalWriteRateLimit} messages per hour to ${proposal.recipient}`, "Vendor follow-up limit reached"));
  }

  /**
   * Process dispatchable actions (tickOutbox)
   *
   * Fetches PENDING or lease-expired DISPATCHING receipts,
   * marks as DISPATCHING with lease, executes, and updates status.
   */
  async tickOutbox(limit: number = 10): Promise<void> {
    const receipts = await this.receipts.getDispatchable(limit, this.clock());
    for (const receipt of receipts) {
      await this.processReceipt(receipt);
    }
  }

  private fail(c: Denied): AuthorizationResult {
    return { authorized: false, error: c.error, escalation_reason: c.escalation };
  }

  private async check(proposal: ActionProposal, rule: ActionRule): Promise<Check> {
    if (proposal.action_class && proposal.action_class !== rule.class) {
      return deny(`${proposal.action_type} is ${rule.class}, not ${proposal.action_class}`, "Action class does not match the trusted rule");
    }

    switch (rule.class) {
      case "READ":
      case "DRAFT":
        return { ok: true };

      case "EXTERNAL_WRITE": {
        const write = this.checkExternalWrite(proposal, rule);
        if (!write.ok) return write;
        return this.checkTaintPolicy(proposal, rule);
      }

      case "BINDING": {
        if (!proposal.approval_id) return deny("BINDING action requires approval_id", "Missing approval for binding action");
        const approved = await this.verifyApproval(proposal, rule);
        if (!approved.ok) return approved;
        return { ok: true };
      }
    }
  }

  /**
   * An approval counts only for the exact operation, subject and revisions it names,
   * and only when granted by the role the trusted rule requires.
   */
  private async verifyApproval(proposal: ActionProposal, rule: ActionRule): Promise<Check> {
    const now = this.clock();
    if (!proposal.approval_id) return deny("Approval required", "Missing approval");
    if (!proposal.subject_id) return deny("Approved action requires subject_id", "Approval cannot be matched to a subject");
    if (!rule.required_role) return deny(`No approving role configured for ${proposal.action_type}`, "Missing trusted role requirement");

    const approval = await this.approvals.getValid(proposal.approval_id, now);
    if (!approval || approval.expires_at.getTime() <= now.getTime()) {
      return deny("Approval not found or expired", "Invalid or expired approval");
    }
    if (approval.granted_role !== rule.required_role) {
      return deny(`Requires ${rule.required_role}, got ${approval.granted_role}`, "Insufficient approval authority");
    }
    const scope = rule.scope ?? proposal.action_type;
    if (approval.scope !== scope) return deny(`Approval scope ${approval.scope} does not cover ${scope}`, "Approval is for a different operation");
    if (approval.subject_id !== proposal.subject_id) {
      return deny(`Approval is for ${approval.subject_id}, not ${proposal.subject_id}`, "Approval is for a different subject");
    }

    const current = await this.revisions.current(proposal.subject_id);
    if (!current) return deny(`No current revisions for ${proposal.subject_id}`, "Cannot verify approval pins");
    for (const k of PIN_KEYS) {
      if ((approval.pins[k] ?? null) !== (current[k] ?? null)) {
        return deny(`Approval pins ${k}=${approval.pins[k] ?? "none"}, current is ${current[k] ?? "none"}`, "Approval is stale for the current revisions");
      }
    }
    return { ok: true };
  }

  /**
   * Check external write policy. Fails closed: no destination, no allow-list entry, no template, no write.
   */
  private checkExternalWrite(proposal: ActionProposal, rule: ActionRule): Check {
    if (!rule.outbound) return { ok: true };
    if (!proposal.recipient) return deny("External write requires a recipient", "Policy violation: missing recipient");
    if (!this.policy.allowedRecipients.includes(proposal.recipient)) {
      return deny(`Recipient ${proposal.recipient} not in allowed list`, "Policy violation: recipient not allowed");
    }
    if (!proposal.template_id) return deny("External email requires template_id", "Policy violation: missing template");
    const smuggled = RESERVED_OUTBOUND_ARGS.filter((k) => k in proposal.arguments);
    if (smuggled.length) {
      return deny(`Destination and template must not be passed in arguments: ${smuggled.join(", ")}`, "Policy violation: unchecked destination");
    }
    return { ok: true };
  }

  /**
   * Check taint policy
   *
   * No tainted arguments to side effects without a verified human approval
   */
  private async checkTaintPolicy(proposal: ActionProposal, rule: ActionRule): Promise<Check> {
    const tainted = proposal.tainted_arguments ?? [];
    if (tainted.length === 0) return { ok: true };
    if (!proposal.approval_id) {
      return deny(`Action has tainted arguments [${tainted.join(", ")}] but no approval`, "Taint policy violation: no approval");
    }
    const approved = await this.verifyApproval(proposal, rule);
    if (!approved.ok) return deny(approved.error, "Taint policy violation: " + approved.escalation);
    return { ok: true };
  }

  private toReceipt(proposal: ActionProposal, rule: ActionRule, idempotencyKey: string): NewReceipt {
    return {
      action_id: proposal.action_id,
      idempotency_key: idempotencyKey,
      status: "PENDING",
      action_type: proposal.action_type,
      action_class: rule.class,
      incident_id: proposal.incident_id,
      subject_id: proposal.subject_id ?? null,
      actor: proposal.actor,
      reason: proposal.reason,
      arguments: proposal.arguments,
      approval_id: proposal.approval_id ?? null,
      recipient: proposal.recipient ?? null,
      template_id: proposal.template_id ?? null,
      dispatched_at: null,
      confirmed_at: null,
      external_id: null,
      error: null,
      lease_expires_at: null,
      retry_count: 0,
    };
  }

  /**
   * Process a single receipt
   */
  private async processReceipt(receipt: ActionReceipt): Promise<void> {
    const now = this.clock();

    // A DISPATCHING receipt here was stranded by a worker whose lease expired. That worker may have
    // completed the write before dying, so ask the external system before writing again.
    if (receipt.status === "DISPATCHING") {
      let externalId: string | null;
      try {
        externalId = await this.adapter.reconcile(receipt.idempotency_key);
      } catch (err) {
        await this.receipts.markUncertain(receipt.receipt_id, err instanceof Error ? err.message : "Cannot verify external state");
        return;
      }
      if (externalId) {
        await this.receipts.markConfirmed(receipt.receipt_id, externalId);
        return;
      }
    }

    // Check retry limit
    if (receipt.retry_count >= this.policy.maxRetries) {
      await this.receipts.markFailed(receipt.receipt_id, "Max retries exceeded");
      return;
    }

    // Mark as dispatching with lease
    const leaseExpiresAt = new Date(now.getTime() + this.policy.leaseDurationSeconds * 1000);
    await this.receipts.markDispatching(receipt.receipt_id, leaseExpiresAt);

    try {
      const result = await this.adapter.execute(receipt);

      if (result.success && result.external_id) {
        await this.receipts.markConfirmed(receipt.receipt_id, result.external_id);
      } else if (result.uncertain) {
        await this.reconcileAction(receipt);
      } else {
        await this.receipts.markFailed(receipt.receipt_id, result.error || "Execution failed");
      }
    } catch {
      await this.reconcileAction(receipt);
    }
  }

  /**
   * Reconcile an uncertain action
   *
   * Implements Invariant 6: No blind retry on uncertain writes
   */
  private async reconcileAction(receipt: ActionReceipt): Promise<void> {
    try {
      const externalId = await this.adapter.reconcile(receipt.idempotency_key);
      if (externalId) {
        await this.receipts.markConfirmed(receipt.receipt_id, externalId);
      }
      // Not found: stays DISPATCHING. After the lease expires the next tick reconciles again before retrying.
    } catch (err) {
      await this.receipts.markUncertain(receipt.receipt_id, err instanceof Error ? err.message : "Cannot verify external state");
    }
  }

  /**
   * Deterministic idempotency key for one logical action. Retries of the same action_id share it;
   * a later action, another destination or another template does not. Nested keys are sorted.
   */
  generateIdempotencyKey(proposal: ActionProposal): string {
    const canonical = canonicalJson({
      action_id: proposal.action_id,
      action_type: proposal.action_type,
      incident_id: proposal.incident_id,
      subject_id: proposal.subject_id ?? null,
      recipient: proposal.recipient ?? null,
      template_id: proposal.template_id ?? null,
      arguments: proposal.arguments,
    });
    return `action:${createHash("sha256").update(canonical).digest("hex")}`;
  }
}

/**
 * In-process receipt store. Atomic because nothing awaits between a check and its write.
 * For tests and the sandbox; the Postgres store does the same in one transaction.
 */
export class MemoryActionReceiptStore implements ActionReceiptStore {
  readonly rows = new Map<string, ActionReceipt>();
  private seq = 0;

  constructor(private readonly clock: () => Date = () => new Date()) {}

  async getByIdempotencyKey(key: string) {
    for (const r of this.rows.values()) if (r.idempotency_key === key) return { ...r };
    return null;
  }

  async insert(receipt: NewReceipt, rateLimit?: { recipient: string; since: Date; max: number }): Promise<InsertOutcome> {
    for (const r of this.rows.values()) if (r.idempotency_key === receipt.idempotency_key) return { inserted: false, reason: "DUPLICATE", existing: { ...r } };
    if (rateLimit) {
      let used = 0;
      for (const r of this.rows.values()) if (r.recipient === rateLimit.recipient && r.created_at >= rateLimit.since) used++;
      if (used >= rateLimit.max) return { inserted: false, reason: "RATE_LIMITED" };
    }
    const receipt_id = `rcpt-${++this.seq}`;
    this.rows.set(receipt_id, { ...receipt, receipt_id, created_at: this.clock() });
    return { inserted: true, receipt_id };
  }

  private patch(id: string, p: Partial<ActionReceipt>) {
    const r = this.rows.get(id);
    if (r) this.rows.set(id, { ...r, ...p });
  }

  async markDispatching(id: string, lease: Date) {
    const r = this.rows.get(id);
    this.patch(id, { status: "DISPATCHING", lease_expires_at: lease, dispatched_at: this.clock(), retry_count: (r?.retry_count ?? 0) + 1 });
  }
  async markConfirmed(id: string, externalId: string) {
    this.patch(id, { status: "CONFIRMED", external_id: externalId, confirmed_at: this.clock(), lease_expires_at: null });
  }
  async markUncertain(id: string, error: string) {
    this.patch(id, { status: "UNCERTAIN", error, lease_expires_at: null });
  }
  async markFailed(id: string, error: string) {
    this.patch(id, { status: "FAILED", error, lease_expires_at: null });
  }
  async getDispatchable(limit: number, now: Date) {
    return [...this.rows.values()]
      .filter((r) => r.status === "PENDING" || (r.status === "DISPATCHING" && r.lease_expires_at !== null && r.lease_expires_at <= now))
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }
}
