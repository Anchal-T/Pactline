// ExecutionGateway — Phase 2E
// Deterministic RBAC + transactional outbox per AGENTS.md §4 and docs/04 §6

import { createHash } from "crypto";

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

/**
 * Action proposal from operator/specialist
 */
export interface ActionProposal {
  action_id: string;
  action_class: ActionClass;
  action_type: string; // "send_vendor_email", "update_po", "send_rfq", etc.
  incident_id: string | null;
  actor: string;
  reason: string;

  // For approval checks
  approval_id?: string;
  required_role?: ApprovalRole;

  // For taint policy
  arguments: Record<string, unknown>;
  tainted_arguments?: string[]; // List of argument keys that are tainted

  // For rate limiting / template validation
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
  pins: {
    requirement_rev?: string;
    config_rev?: string;
    offer_rev?: string;
    plan_rev?: string;
    schedule_rev?: string;
  };

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
  incident_id: string | null;
  actor: string;
  reason: string;
  arguments: Record<string, unknown>;
  approval_id: string | null;

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
   * Execute an action (send email, update PO, etc.)
   */
  execute(action: ActionReceipt): Promise<ExecutionResult>;

  /**
   * Reconcile an uncertain action by checking external state
   * Returns external_id if found, null if safe to retry, throws if uncertain
   */
  reconcile(idempotencyKey: string): Promise<string | null>;
}

/**
 * Action receipt store interface
 */
export interface ActionReceiptStore {
  /**
   * Check if an action with this idempotency key already exists
   */
  exists(idempotencyKey: string): Promise<boolean>;

  /**
   * Get existing receipt by idempotency key
   */
  getByIdempotencyKey(idempotencyKey: string): Promise<ActionReceipt | null>;

  /**
   * Insert a new receipt with PENDING status
   * Must be done in same transaction as approval re-check
   */
  insert(receipt: Omit<ActionReceipt, "receipt_id" | "created_at">): Promise<string>;

  /**
   * Update receipt status to DISPATCHING with lease
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
  getDispatchable(limit: number): Promise<ActionReceipt[]>;
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

/**
 * Policy configuration
 */
export interface PolicyConfig {
  // Rate limits (per recipient per hour)
  externalWriteRateLimit: number;

  // Allowed recipients for external writes
  allowedRecipients: string[];

  // Lease duration for dispatching actions (seconds)
  leaseDurationSeconds: number;

  // Max retries before escalation
  maxRetries: number;
}

const DEFAULT_POLICY: PolicyConfig = {
  externalWriteRateLimit: 10,
  allowedRecipients: [],
  leaseDurationSeconds: 300, // 5 minutes
  maxRetries: 3,
};

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
  constructor(
    private readonly receiptStore: ActionReceiptStore,
    private readonly approvalStore: ApprovalStore,
    private readonly adapter: ExternalAdapter,
    private readonly policy: PolicyConfig = DEFAULT_POLICY,
    private readonly clock: () => Date = () => new Date()
  ) {}

  /**
   * Authorize an action proposal
   *
   * Returns authorization result with idempotency key.
   * Caller must insert receipt in same transaction as approval check.
   */
  async authorize(proposal: ActionProposal): Promise<AuthorizationResult> {
    const now = this.clock();

    // Generate deterministic idempotency key
    const idempotencyKey = this.generateIdempotencyKey(proposal);

    // Check if already processed
    const existing = await this.receiptStore.getByIdempotencyKey(idempotencyKey);
    if (existing) {
      if (existing.status === "CONFIRMED") {
        return {
          authorized: false,
          error: "Action already confirmed",
          idempotency_key: idempotencyKey,
        };
      }
      // PENDING, DISPATCHING, UNCERTAIN, or FAILED can proceed (retry)
      return {
        authorized: true,
        receipt_id: existing.receipt_id,
        idempotency_key: idempotencyKey,
      };
    }

    // Check action class requirements
    switch (proposal.action_class) {
      case "READ":
      case "DRAFT":
        // Always allowed, logged
        break;

      case "EXTERNAL_WRITE":
        // Check template, recipient, rate limits
        const writeCheck = this.checkExternalWrite(proposal);
        if (!writeCheck.authorized) {
          return {
            authorized: false,
            error: writeCheck.error,
            escalation_reason: "Policy violation: " + writeCheck.error,
          };
        }
        break;

      case "BINDING":
        // Requires valid approval
        if (!proposal.approval_id) {
          return {
            authorized: false,
            error: "BINDING action requires approval_id",
            escalation_reason: "Missing approval for binding action",
          };
        }

        const approval = await this.approvalStore.getValid(proposal.approval_id, now);
        if (!approval) {
          return {
            authorized: false,
            error: "Approval not found or expired",
            escalation_reason: "Invalid or expired approval",
          };
        }

        // Check approval role matches required role
        if (proposal.required_role && approval.granted_role !== proposal.required_role) {
          return {
            authorized: false,
            error: `Requires ${proposal.required_role}, got ${approval.granted_role}`,
            escalation_reason: "Insufficient approval authority",
          };
        }
        break;
    }

    // Check taint policy
    const taintCheck = this.checkTaintPolicy(proposal);
    if (!taintCheck.authorized) {
      return {
        authorized: false,
        error: taintCheck.error,
        escalation_reason: "Taint policy violation: " + taintCheck.error,
      };
    }

    // Authorization passed
    // Caller must insert receipt in transaction
    return {
      authorized: true,
      idempotency_key: idempotencyKey,
    };
  }

  /**
   * Insert a pending action receipt
   * Must be called in same transaction as approval check
   */
  async insertReceipt(
    proposal: ActionProposal,
    idempotencyKey: string
  ): Promise<string> {
    return await this.receiptStore.insert({
      action_id: proposal.action_id,
      idempotency_key: idempotencyKey,
      status: "PENDING",
      action_type: proposal.action_type,
      incident_id: proposal.incident_id,
      actor: proposal.actor,
      reason: proposal.reason,
      arguments: proposal.arguments,
      approval_id: proposal.approval_id ?? null,
      dispatched_at: null,
      confirmed_at: null,
      external_id: null,
      error: null,
      lease_expires_at: null,
      retry_count: 0,
    });
  }

  /**
   * Process dispatchable actions (tickOutbox)
   *
   * Fetches PENDING or lease-expired DISPATCHING receipts,
   * marks as DISPATCHING with lease, executes, and updates status.
   */
  async tickOutbox(limit: number = 10): Promise<void> {
    const receipts = await this.receiptStore.getDispatchable(limit);

    for (const receipt of receipts) {
      await this.processReceipt(receipt);
    }
  }

  /**
   * Process a single receipt
   */
  private async processReceipt(receipt: ActionReceipt): Promise<void> {
    const now = this.clock();

    // Check retry limit
    if (receipt.retry_count >= this.policy.maxRetries) {
      await this.receiptStore.markFailed(
        receipt.receipt_id,
        "Max retries exceeded"
      );
      return;
    }

    // Mark as dispatching with lease
    const leaseExpiresAt = new Date(now.getTime() + this.policy.leaseDurationSeconds * 1000);
    await this.receiptStore.markDispatching(receipt.receipt_id, leaseExpiresAt);

    try {
      // Execute the action
      const result = await this.adapter.execute(receipt);

      if (result.success && result.external_id) {
        // Confirmed success
        await this.receiptStore.markConfirmed(receipt.receipt_id, result.external_id);
      } else if (result.uncertain) {
        // Uncertain outcome - try to reconcile
        await this.reconcileAction(receipt);
      } else {
        // Known failure
        await this.receiptStore.markFailed(
          receipt.receipt_id,
          result.error || "Execution failed"
        );
      }
    } catch (err) {
      // Execution error - try to reconcile
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
        // Found in external system - mark confirmed
        await this.receiptStore.markConfirmed(receipt.receipt_id, externalId);
      } else {
        // Not found and safe to retry - will be picked up in next tick
        // Status remains DISPATCHING with expired lease
      }
    } catch (err) {
      // Cannot verify - escalate as UNCERTAIN
      await this.receiptStore.markUncertain(
        receipt.receipt_id,
        err instanceof Error ? err.message : "Cannot verify external state"
      );
    }
  }

  /**
   * Generate deterministic idempotency key
   */
  private generateIdempotencyKey(proposal: ActionProposal): string {
    const canonical = JSON.stringify({
      action_type: proposal.action_type,
      incident_id: proposal.incident_id,
      actor: proposal.actor,
      arguments: this.sortKeys(proposal.arguments),
    });

    const hash = createHash("sha256").update(canonical).digest("hex");
    return `action:${hash.substring(0, 16)}`;
  }

  /**
   * Sort object keys for canonical representation
   */
  private sortKeys(obj: Record<string, unknown>): Record<string, unknown> {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = obj[key];
    }
    return sorted;
  }

  /**
   * Check external write policy
   */
  private checkExternalWrite(proposal: ActionProposal): { authorized: boolean; error?: string } {
    // Check recipient whitelist
    if (proposal.recipient && this.policy.allowedRecipients.length > 0) {
      if (!this.policy.allowedRecipients.includes(proposal.recipient)) {
        return {
          authorized: false,
          error: `Recipient ${proposal.recipient} not in allowed list`,
        };
      }
    }

    // Check template if specified
    if (proposal.action_type === "send_vendor_email" && !proposal.template_id) {
      return {
        authorized: false,
        error: "External email requires template_id",
      };
    }

    // Rate limit check would go here (TODO: implement with time-window counter in DB)

    return { authorized: true };
  }

  /**
   * Check taint policy
   *
   * No tainted arguments to side effects without human approval
   */
  private checkTaintPolicy(proposal: ActionProposal): { authorized: boolean; error?: string } {
    // Only check for side-effect actions
    if (proposal.action_class === "READ" || proposal.action_class === "DRAFT") {
      return { authorized: true };
    }

    // If no tainted arguments, allow
    if (!proposal.tainted_arguments || proposal.tainted_arguments.length === 0) {
      return { authorized: true };
    }

    // Tainted arguments require approval
    if (!proposal.approval_id) {
      return {
        authorized: false,
        error: `Action has tainted arguments [${proposal.tainted_arguments.join(", ")}] but no approval`,
      };
    }

    return { authorized: true };
  }
}
