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
  /** Argument keys from untrusted sources. Non-empty means dispatch re-verifies the approval. */
  tainted_arguments: string[];
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


export interface RateLimit {
  recipient: string;
  since: Date;
  max: number;
}

/** The validity window of one pinned supplier offer revision. */
export interface SupplierOfferValidity {
  offer_rev: string;
  expires_at: Date;
}

/** Fencing token for result writes: the claim that set this retry_count must still be current. */
export type Fence = Pick<ActionReceipt, "receipt_id" | "retry_count">;

/** A receipt this worker now holds. `recovered` means a previous worker's lease expired mid-dispatch. */
export interface Claim {
  receipt: ActionReceipt;
  recovered: boolean;
}

/**
 * Everything one gateway transaction may read or write. The Postgres store runs the callback inside
 * BEGIN ... COMMIT, reads approvals, revisions and offers FOR SHARE (so a revision or a revocation cannot commit
 * until this transaction does), and rolls back if the callback throws.
 */
export interface GatewayTx {
  getValidApproval(approvalId: string, now: Date): Promise<Approval | null>;
  currentRevisions(subjectId: string): Promise<RevisionPins | null>;
  getOffer(offerRev: string): Promise<SupplierOfferValidity | null>;
  getReceiptByKey(idempotencyKey: string): Promise<ActionReceipt | null>;
  /**
   * Insert a PENDING receipt. A receipt with the same key wins (DUPLICATE). With `rateLimit`, refuse
   * (RATE_LIMITED) when `max` outbound receipts to that recipient were created since `since`.
   */
  insertReceipt(receipt: NewReceipt, rateLimit?: RateLimit): Promise<InsertOutcome>;
  /**
   * Conditional update, the only way to start a dispatch: take the receipt only if it is PENDING, or
   * DISPATCHING with a lease that expired at `now`. Sets DISPATCHING, the new lease and retry_count + 1.
   * Returns null when the receipt is not claimable, for example because another worker holds it.
   */
  claim(receiptId: string, now: Date, leaseExpiresAt: Date): Promise<Claim | null>;
  /**
   * Result writes apply only while `fence` is the current claim (DISPATCHING with the same retry_count).
   * Return false when a later claim took the receipt, so a worker whose lease expired writes nothing.
   */
  markConfirmed(fence: Fence, externalId: string): Promise<boolean>;
  markUncertain(fence: Fence, error: string): Promise<boolean>;
  markFailed(fence: Fence, error: string): Promise<boolean>;
}

export interface GatewayStore {
  transaction<T>(fn: (tx: GatewayTx) => Promise<T>): Promise<T>;
  /** Candidate receipt ids (PENDING, or DISPATCHING with an expired lease). Each must still be claimed. */
  listDispatchable(limit: number, now: Date): Promise<string[]>;
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

  // Max dispatch attempts before the receipt is failed
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
  store: GatewayStore;
  adapter: ExternalAdapter;
  policy?: Partial<PolicyConfig>;
  clock?: () => Date;
}

type Denied = { ok: false; error: string; escalation: string };
type Check = { ok: true } | Denied;

const deny = (error: string, escalation: string): Denied => ({ ok: false, error, escalation });
const HOUR_MS = 3_600_000;
const PIN_KEYS: Array<keyof RevisionPins> = ["requirement_rev", "config_rev", "offer_rev", "plan_rev", "schedule_rev"];
const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

/** The fields an approval is matched against, present on both a proposal and a receipt. */
interface ApprovalRequest {
  action_type: string;
  approval_id?: string | null;
  subject_id?: string | null;
}

/**
 * Execution Gateway
 *
 * Enforces:
 * - Invariant 2: No unauthorized technical/commercial action
 * - Invariant 3/4: No expired supplier offer and no stale approval reuse (checked inside the enqueue
 *   transaction and again at dispatch)
 * - Invariant 6: No blind retry on uncertain writes
 * - Taint policy: No tainted arguments to side effects without approval
 */
export class ExecutionGateway {
  private readonly store: GatewayStore;
  private readonly adapter: ExternalAdapter;
  private readonly policy: PolicyConfig;
  private readonly rules: Record<string, ActionRule>;
  private readonly clock: () => Date;

  constructor(deps: GatewayDeps) {
    this.store = deps.store;
    this.adapter = deps.adapter;
    this.policy = { ...DEFAULT_POLICY, ...deps.policy };
    this.rules = this.policy.actionRules ?? { ...DEFAULT_ACTION_RULES };
    this.clock = deps.clock ?? (() => new Date());
  }

  /**
   * Check a proposal without queueing it. Every call re-runs every check, including for an action that
   * already has a receipt. Advisory only: `enqueue` repeats the checks inside its own transaction.
   */
  async authorize(proposal: ActionProposal): Promise<AuthorizationResult> {
    return this.store.transaction(async (tx) => {
      const pre = await this.check(tx, proposal);
      if (!pre.ok) return this.fail(pre);
      const key = this.generateIdempotencyKey(proposal);
      const existing = await tx.getReceiptByKey(key);
      if (existing?.status === "CONFIRMED") return { authorized: false, error: "Action already confirmed", idempotency_key: key };
      return { authorized: true, idempotency_key: key, receipt_id: existing?.receipt_id };
    });
  }

  /**
   * Authorize and write the PENDING receipt in one transaction: the approval, the current revisions,
   * the recipient's hourly allowance and the insert all commit together or not at all.
   */
  async enqueue(proposal: ActionProposal): Promise<AuthorizationResult> {
    return this.store.transaction(async (tx) => {
      const pre = await this.check(tx, proposal);
      if (!pre.ok) return this.fail(pre);

      const rule = this.rules[proposal.action_type]!;
      const key = this.generateIdempotencyKey(proposal);
      const rateLimit =
        rule.outbound && proposal.recipient
          ? { recipient: proposal.recipient, since: new Date(this.clock().getTime() - HOUR_MS), max: this.policy.externalWriteRateLimit }
          : undefined;

      const outcome = await tx.insertReceipt(this.toReceipt(proposal, rule, key), rateLimit);
      if (outcome.inserted) return { authorized: true, idempotency_key: key, receipt_id: outcome.receipt_id };
      if (outcome.reason === "DUPLICATE") {
        return outcome.existing.status === "CONFIRMED"
          ? { authorized: false, error: "Action already confirmed", idempotency_key: key }
          : { authorized: true, idempotency_key: key, receipt_id: outcome.existing.receipt_id };
      }
      return this.fail(deny(`Rate limit: ${this.policy.externalWriteRateLimit} messages per hour to ${proposal.recipient}`, "Vendor follow-up limit reached"));
    });
  }

  /**
   * Process dispatchable actions (tickOutbox). Safe to run from several workers at once:
   * a receipt is executed only by the worker whose claim succeeded.
   */
  async tickOutbox(limit: number = 10): Promise<void> {
    const ids = await this.store.listDispatchable(limit, this.clock());
    for (const id of ids) {
      await this.processReceipt(id);
    }
  }

  private fail(c: Denied): AuthorizationResult {
    return { authorized: false, error: c.error, escalation_reason: c.escalation };
  }

  private async check(tx: GatewayTx, proposal: ActionProposal): Promise<Check> {
    const rule = this.rules[proposal.action_type];
    if (!rule) return deny(`Unknown action type ${proposal.action_type}`, "No trusted rule for this action");
    if (proposal.action_class && proposal.action_class !== rule.class) {
      return deny(`${proposal.action_type} is ${rule.class}, not ${proposal.action_class}`, "Action class does not match the trusted rule");
    }
    if (!rule.outbound) {
      const destination = [
        ...(proposal.recipient ? ["recipient"] : []),
        ...(proposal.template_id ? ["template_id"] : []),
        ...RESERVED_OUTBOUND_ARGS.filter((k) => k in proposal.arguments).map((k) => `arguments.${k}`),
      ];
      if (destination.length) {
        return deny(`${proposal.action_type} is not an outbound action and cannot carry ${destination.join(", ")}`, "Policy violation: destination on a non-outbound action");
      }
    }

    switch (rule.class) {
      case "READ":
      case "DRAFT":
        return { ok: true };

      case "EXTERNAL_WRITE": {
        const write = this.checkExternalWrite(proposal, rule);
        if (!write.ok) return write;
        return this.checkTaintPolicy(tx, proposal, rule);
      }

      case "BINDING":
        if (!proposal.approval_id) return deny("BINDING action requires approval_id", "Missing approval for binding action");
        return this.verifyApproval(tx, proposal, rule);
    }
  }

  /**
   * An approval counts only for the exact operation, subject and revisions it names,
   * and only when granted by the role the trusted rule requires.
   */
  private async verifyApproval(tx: GatewayTx, req: ApprovalRequest, rule: ActionRule): Promise<Check> {
    const now = this.clock();
    if (!req.approval_id) return deny("Approval required", "Missing approval");
    if (!req.subject_id) return deny("Approved action requires subject_id", "Approval cannot be matched to a subject");
    if (!rule.required_role) return deny(`No approving role configured for ${req.action_type}`, "Missing trusted role requirement");

    // Revision writers lock the subject before invalidating its approvals.
    const current = await tx.currentRevisions(req.subject_id);
    const approval = await tx.getValidApproval(req.approval_id, now);
    if (!approval || approval.expires_at.getTime() <= now.getTime()) {
      return deny("Approval not found or expired", "Invalid or expired approval");
    }
    if (approval.granted_role !== rule.required_role) {
      return deny(`Requires ${rule.required_role}, got ${approval.granted_role}`, "Insufficient approval authority");
    }
    const scope = rule.scope ?? req.action_type;
    if (approval.scope !== scope) return deny(`Approval scope ${approval.scope} does not cover ${scope}`, "Approval is for a different operation");
    if (approval.subject_id !== req.subject_id) {
      return deny(`Approval is for ${approval.subject_id}, not ${req.subject_id}`, "Approval is for a different subject");
    }

    if (!current) return deny(`No current revisions for ${req.subject_id}`, "Cannot verify approval pins");
    for (const k of PIN_KEYS) {
      if ((approval.pins[k] ?? null) !== (current[k] ?? null)) {
        return deny(`Approval pins ${k}=${approval.pins[k] ?? "none"}, current is ${current[k] ?? "none"}`, "Approval is stale for the current revisions");
      }
    }

    const offerRev = approval.pins.offer_rev;
    if (offerRev) {
      const offer = await tx.getOffer(offerRev);
      if (!offer) return deny(`Supplier offer ${offerRev} not found`, "Cannot verify supplier offer");
      if (offer.expires_at.getTime() <= now.getTime()) {
        return deny(`Supplier offer ${offerRev} expired at ${offer.expires_at.toISOString()}`, "Supplier offer expired");
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
  private async checkTaintPolicy(tx: GatewayTx, proposal: ActionProposal, rule: ActionRule): Promise<Check> {
    const tainted = proposal.tainted_arguments ?? [];
    if (tainted.length === 0) return { ok: true };
    if (!proposal.approval_id) {
      return deny(`Action has tainted arguments [${tainted.join(", ")}] but no approval`, "Taint policy violation: no approval");
    }
    const approved = await this.verifyApproval(tx, proposal, rule);
    if (!approved.ok) return deny(approved.error, "Taint policy violation: " + approved.escalation);
    return { ok: true };
  }

  /** Receipts whose execution rests on a human approval, which dispatch must re-verify. */
  private needsApproval(receipt: ActionReceipt): boolean {
    return receipt.action_class === "BINDING" || (receipt.action_class === "EXTERNAL_WRITE" && receipt.tainted_arguments.length > 0);
  }

  /** READ and DRAFT have no external side effect: their receipt is the log entry and is never dispatched. */
  private reachesAdapter(actionClass: ActionClass): boolean {
    return actionClass === "EXTERNAL_WRITE" || actionClass === "BINDING";
  }

  private toReceipt(proposal: ActionProposal, rule: ActionRule, idempotencyKey: string): NewReceipt {
    const dispatched = this.reachesAdapter(rule.class);
    return {
      action_id: proposal.action_id,
      idempotency_key: idempotencyKey,
      status: dispatched ? "PENDING" : "CONFIRMED",
      action_type: proposal.action_type,
      action_class: rule.class,
      incident_id: proposal.incident_id,
      subject_id: proposal.subject_id ?? null,
      actor: proposal.actor,
      reason: proposal.reason,
      arguments: proposal.arguments,
      tainted_arguments: proposal.tainted_arguments ?? [],
      approval_id: proposal.approval_id ?? null,
      recipient: proposal.recipient ?? null,
      template_id: proposal.template_id ?? null,
      dispatched_at: null,
      confirmed_at: dispatched ? null : this.clock(),
      external_id: null,
      error: null,
      lease_expires_at: null,
      retry_count: 0,
    };
  }

  /**
   * Process a single receipt: claim it, reconcile if a previous worker died mid-dispatch,
   * re-verify the approval it rests on, then execute.
   */
  private async processReceipt(receiptId: string): Promise<void> {
    const now = this.clock();
    const leaseExpiresAt = new Date(now.getTime() + this.policy.leaseDurationSeconds * 1000);

    const claim = await this.store.transaction((tx) => tx.claim(receiptId, now, leaseExpiresAt));
    if (!claim) return; // another worker holds it
    const { receipt } = claim;

    // The previous holder may have completed the write before dying: ask the external system first.
    if (claim.recovered) {
      let externalId: string | null;
      try {
        externalId = await this.adapter.reconcile(receipt.idempotency_key);
      } catch (err) {
        await this.store.transaction((tx) => tx.markUncertain(receipt, message(err, "Cannot verify external state")));
        return;
      }
      if (externalId) {
        const found = externalId;
        await this.store.transaction((tx) => tx.markConfirmed(receipt, found));
        return;
      }
    }

    // Retry budget and approval are checked while this worker holds the lease, right before the write.
    const gate = await this.store.transaction(async (tx): Promise<Check> => {
      if (!this.reachesAdapter(receipt.action_class)) {
        await tx.markFailed(receipt, `${receipt.action_class} actions are never dispatched`);
        return deny("Not dispatchable", "No external side effect for this class");
      }
      if (receipt.retry_count > this.policy.maxRetries) {
        await tx.markFailed(receipt, "Max retries exceeded");
        return deny("Max retries exceeded", "Retry budget spent");
      }
      if (this.needsApproval(receipt)) {
        const rule = this.rules[receipt.action_type];
        const ok = rule ? await this.verifyApproval(tx, receipt, rule) : deny(`Unknown action type ${receipt.action_type}`, "No trusted rule");
        if (!ok.ok) {
          await tx.markFailed(receipt, `Approval no longer valid at dispatch: ${ok.error}`);
          return ok;
        }
      }
      return { ok: true };
    });
    if (!gate.ok) return;

    // Every result write below is fenced on this claim: if the lease lapsed and another worker reclaimed
    // the receipt, the write changes nothing and this worker stops.
    try {
      const result = await this.adapter.execute(receipt);
      const externalId = result.external_id;
      if (result.success && externalId) {
        await this.store.transaction((tx) => tx.markConfirmed(receipt, externalId));
      } else if (result.uncertain) {
        await this.reconcileAction(receipt);
      } else {
        await this.store.transaction((tx) => tx.markFailed(receipt, result.error || "Execution failed"));
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
      if (externalId) await this.store.transaction((tx) => tx.markConfirmed(receipt, externalId));
      // Not found: stays DISPATCHING. After the lease expires the next claim reconciles again before retrying.
    } catch (err) {
      await this.store.transaction((tx) => tx.markUncertain(receipt, message(err, "Cannot verify external state")));
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
 * In-process store for tests and the sandbox. Transactions run one at a time (a promise-chain lock),
 * so a check and the write that depends on it cannot interleave with another transaction, and a
 * transaction that throws is rolled back. The Postgres store gets the same guarantees from
 * BEGIN/COMMIT, FOR SHARE reads and a conditional UPDATE for claims.
 */
export class MemoryGatewayStore implements GatewayStore {
  readonly receipts = new Map<string, ActionReceipt>();
  readonly approvals = new Map<string, Approval>();
  readonly revisions = new Map<string, RevisionPins>();
  readonly offers = new Map<string, SupplierOfferValidity>();
  private seq = 0;
  private lock: Promise<unknown> = Promise.resolve();

  constructor(private readonly clock: () => Date = () => new Date()) {}

  transaction<T>(fn: (tx: GatewayTx) => Promise<T>): Promise<T> {
    const run = this.lock.then(async () => {
      const snapshot = new Map([...this.receipts].map(([k, v]) => [k, { ...v }]));
      const seq = this.seq;
      try {
        return await fn(this.tx);
      } catch (err) {
        this.receipts.clear();
        snapshot.forEach((v, k) => this.receipts.set(k, v));
        this.seq = seq;
        throw err;
      }
    });
    this.lock = run.catch(() => undefined);
    return run;
  }

  async listDispatchable(limit: number, now: Date): Promise<string[]> {
    return [...this.receipts.values()]
      .filter((r) => r.status === "PENDING" || (r.status === "DISPATCHING" && r.lease_expires_at !== null && r.lease_expires_at <= now))
      .slice(0, limit)
      .map((r) => r.receipt_id);
  }

  /** World writes (a new revision, a granted or revoked approval) take the same lock as the gateway. */
  setRevisions(subjectId: string, pins: RevisionPins): Promise<void> {
    return this.transaction(async () => {
      this.revisions.set(subjectId, pins);
    });
  }

  setApproval(approval: Approval): Promise<void> {
    return this.transaction(async () => {
      this.approvals.set(approval.approval_id, approval);
    });
  }

  setOffer(offer: SupplierOfferValidity): Promise<void> {
    return this.transaction(async () => {
      this.offers.set(offer.offer_rev, offer);
    });
  }

  private fencedPatch(fence: Fence, p: Partial<ActionReceipt>): boolean {
    const r = this.receipts.get(fence.receipt_id);
    if (!r || r.status !== "DISPATCHING" || r.retry_count !== fence.retry_count) return false;
    this.receipts.set(fence.receipt_id, { ...r, ...p });
    return true;
  }

  private readonly tx: GatewayTx = {
    getValidApproval: async (id, now) => {
      const a = this.approvals.get(id);
      return a && a.expires_at > now ? { ...a, pins: { ...a.pins } } : null;
    },
    currentRevisions: async (subjectId) => {
      const r = this.revisions.get(subjectId);
      return r ? { ...r } : null;
    },
    getOffer: async (offerRev) => {
      const o = this.offers.get(offerRev);
      return o ? { ...o } : null;
    },
    getReceiptByKey: async (key) => {
      for (const r of this.receipts.values()) if (r.idempotency_key === key) return { ...r };
      return null;
    },
    insertReceipt: async (receipt, rateLimit) => {
      for (const r of this.receipts.values()) {
        if (r.idempotency_key === receipt.idempotency_key) return { inserted: false, reason: "DUPLICATE", existing: { ...r } };
      }
      if (rateLimit) {
        let used = 0;
        for (const r of this.receipts.values()) if (r.recipient === rateLimit.recipient && r.created_at >= rateLimit.since) used++;
        if (used >= rateLimit.max) return { inserted: false, reason: "RATE_LIMITED" };
      }
      const receipt_id = `rcpt-${++this.seq}`;
      this.receipts.set(receipt_id, { ...receipt, receipt_id, created_at: this.clock() });
      return { inserted: true, receipt_id };
    },
    claim: async (id, now, lease) => {
      const r = this.receipts.get(id);
      if (!r) return null;
      const stranded = r.status === "DISPATCHING" && r.lease_expires_at !== null && r.lease_expires_at <= now;
      if (r.status !== "PENDING" && !stranded) return null;
      const next: ActionReceipt = { ...r, status: "DISPATCHING", lease_expires_at: lease, dispatched_at: now, retry_count: r.retry_count + 1 };
      this.receipts.set(id, next);
      return { receipt: { ...next }, recovered: stranded };
    },
    markConfirmed: async (fence, externalId) =>
      this.fencedPatch(fence, { status: "CONFIRMED", external_id: externalId, confirmed_at: this.clock(), lease_expires_at: null }),
    markUncertain: async (fence, error) => this.fencedPatch(fence, { status: "UNCERTAIN", error, lease_expires_at: null }),
    markFailed: async (fence, error) => this.fencedPatch(fence, { status: "FAILED", error, lease_expires_at: null }),
  };
}
