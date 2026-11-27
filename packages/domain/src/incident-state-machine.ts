// Incident State Machine — Phase 2C
// Implements the incident lifecycle with valid transitions, preconditions, and invariants
// per docs/04 §3 and AGENTS.md §5 invariant 8

import type { IncidentStatus } from "./entities.js";

/**
 * Incident metadata required for transition validation
 */
export interface IncidentState {
  id: string;
  status: IncidentStatus;
  version: number;
  owner: string | null;
  next_action: string | null;
  blocker: string | null;
  next_review_at: Date | null;
  accepted_qty: number;
  required_qty: number;
  has_valid_waiver: boolean;
  has_schedule_disposition: boolean;
  has_valid_approval: boolean;
  approval_expired: boolean;
}

/**
 * Transition request with actor and reason for audit
 */
export interface TransitionRequest {
  to: IncidentStatus;
  actor: string;
  reason: string;
  metadata?: Record<string, unknown>;
  // Optional fields for specific transitions
  owner?: string;
  next_action?: string;
  blocker?: string;
  next_review_at?: Date;
}

/**
 * Transition result for audit logging
 */
export interface TransitionResult {
  success: boolean;
  from_status: IncidentStatus;
  to_status?: IncidentStatus;
  new_version?: number;
  error?: string;
  audit: {
    actor: string;
    reason: string;
    timestamp: Date;
    metadata?: Record<string, unknown>;
  };
}

/**
 * Valid state transitions map
 * Key: current status, Value: array of allowed next statuses
 */
const VALID_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  DETECTED: ["INVESTIGATING"],
  INVESTIGATING: ["PLANNING", "BLOCKED"],
  PLANNING: ["AWAITING_APPROVAL", "EXECUTING"],
  AWAITING_APPROVAL: ["EXECUTING", "PLANNING"],
  EXECUTING: ["MITIGATED", "ESCALATED"],
  MITIGATED: ["VERIFYING", "INVESTIGATING"],
  VERIFYING: ["CLOSED", "PLANNING"],
  CLOSED: [], // Terminal state
  ESCALATED: ["PLANNING"],
  BLOCKED: ["INVESTIGATING"],
};

/**
 * Precondition checks for each status transition
 */
type PreconditionCheck = (state: IncidentState, request: TransitionRequest) => string | null;

const PRECONDITIONS: Partial<Record<IncidentStatus, PreconditionCheck>> = {
  INVESTIGATING: (state, request) => {
    if (!request.owner) {
      return "INVESTIGATING requires an owner";
    }
    if (!request.next_action && !request.blocker) {
      return "INVESTIGATING requires next_action or blocker";
    }
    if (!request.next_review_at) {
      return "INVESTIGATING requires next_review_at";
    }
    return null;
  },

  PLANNING: (state, request) => {
    if (!request.owner) {
      return "PLANNING requires an owner";
    }
    if (!request.next_action) {
      return "PLANNING requires next_action";
    }
    if (!request.next_review_at) {
      return "PLANNING requires next_review_at";
    }
    return null;
  },

  AWAITING_APPROVAL: (state, request) => {
    if (!request.owner) {
      return "AWAITING_APPROVAL requires an owner";
    }
    if (!request.next_review_at) {
      return "AWAITING_APPROVAL requires next_review_at (approval deadline)";
    }
    return null;
  },

  EXECUTING: (state, request) => {
    // Coming from AWAITING_APPROVAL requires valid approval
    if (state.status === "AWAITING_APPROVAL") {
      if (!state.has_valid_approval) {
        return "EXECUTING from AWAITING_APPROVAL requires valid approval";
      }
      if (state.approval_expired) {
        return "Cannot execute with expired approval";
      }
    }
    if (!request.owner) {
      return "EXECUTING requires an owner";
    }
    if (!request.next_action) {
      return "EXECUTING requires next_action";
    }
    if (!request.next_review_at) {
      return "EXECUTING requires next_review_at";
    }
    return null;
  },

  MITIGATED: (state, request) => {
    if (!request.owner) {
      return "MITIGATED requires an owner (for monitoring)";
    }
    if (!request.next_review_at) {
      return "MITIGATED requires next_review_at (monitoring schedule)";
    }
    return null;
  },

  VERIFYING: (state, request) => {
    if (!request.owner) {
      return "VERIFYING requires an owner";
    }
    if (!request.next_review_at) {
      return "VERIFYING requires next_review_at";
    }
    return null;
  },

  CLOSED: (state, request) => {
    // Invariant 5: No closure on email/ETA alone
    const hasAcceptedQty = state.accepted_qty >= state.required_qty;
    const hasValidWaiver = state.has_valid_waiver && state.has_schedule_disposition;

    if (!hasAcceptedQty && !hasValidWaiver) {
      return "CLOSED requires accepted_qty >= required_qty OR valid waiver + schedule disposition";
    }
    return null;
  },

  ESCALATED: (state, request) => {
    if (!request.owner) {
      return "ESCALATED requires an owner";
    }
    if (!request.blocker) {
      return "ESCALATED requires a blocker description";
    }
    if (!request.next_review_at) {
      return "ESCALATED requires next_review_at";
    }
    return null;
  },

  BLOCKED: (state, request) => {
    if (!request.owner) {
      return "BLOCKED requires an owner";
    }
    if (!request.blocker) {
      return "BLOCKED requires a blocker description";
    }
    if (!request.next_review_at) {
      return "BLOCKED requires next_review_at";
    }
    return null;
  },
};

/**
 * Incident State Machine
 *
 * Enforces:
 * - Valid state transitions per docs/04 §3
 * - Preconditions for each transition
 * - Invariant 8: owner + next_action/blocker + next_review_at on every open incident
 * - Invariant 5: closure requirements
 * - Optimistic version checking
 */
export class IncidentStateMachine {
  /**
   * Check if a transition is valid based on the state graph
   */
  static isValidTransition(from: IncidentStatus, to: IncidentStatus): boolean {
    const allowedTransitions = VALID_TRANSITIONS[from];
    return allowedTransitions.includes(to);
  }

  /**
   * Get all valid next states for a given status
   */
  static getValidNextStates(status: IncidentStatus): IncidentStatus[] {
    return [...VALID_TRANSITIONS[status]];
  }

  /**
   * Validate a transition request against current state
   * Returns null if valid, error message if invalid
   */
  static validateTransition(
    state: IncidentState,
    request: TransitionRequest
  ): string | null {
    // Check if transition is allowed by the state graph
    if (!this.isValidTransition(state.status, request.to)) {
      return `Invalid transition from ${state.status} to ${request.to}`;
    }

    // Check preconditions for the target state
    const preconditionCheck = PRECONDITIONS[request.to];
    if (preconditionCheck) {
      const preconditionError = preconditionCheck(state, request);
      if (preconditionError) {
        return preconditionError;
      }
    }

    return null;
  }

  /**
   * Execute a state transition with optimistic version checking
   * Returns a transition result for audit logging
   *
   * Note: This is a pure function - actual DB update must be done by caller
   * with optimistic locking (WHERE version = expectedVersion)
   */
  static transition(
    state: IncidentState,
    request: TransitionRequest
  ): TransitionResult {
    const audit = {
      actor: request.actor,
      reason: request.reason,
      timestamp: new Date(),
      metadata: request.metadata,
    };

    // Validate the transition
    const validationError = this.validateTransition(state, request);
    if (validationError) {
      return {
        success: false,
        from_status: state.status,
        error: validationError,
        audit,
      };
    }

    // Transition is valid
    return {
      success: true,
      from_status: state.status,
      to_status: request.to,
      new_version: state.version + 1,
      audit,
    };
  }

  /**
   * Check if an incident state satisfies invariant 8:
   * Every non-CLOSED incident must have owner, next_review_at,
   * and either next_action or blocker
   */
  static validateInvariant8(state: Partial<IncidentState>): string | null {
    if (state.status === "CLOSED") {
      return null; // CLOSED incidents are exempt
    }

    if (!state.owner) {
      return "Open incident must have an owner";
    }

    if (!state.next_review_at) {
      return "Open incident must have next_review_at";
    }

    if (!state.next_action && !state.blocker) {
      return "Open incident must have either next_action or blocker";
    }

    return null;
  }

  /**
   * Helper to build a valid transition request with required fields
   * populated based on target status
   */
  static buildTransitionRequest(params: {
    to: IncidentStatus;
    actor: string;
    reason: string;
    owner?: string;
    next_action?: string;
    blocker?: string;
    next_review_at?: Date;
    metadata?: Record<string, unknown>;
  }): TransitionRequest {
    return {
      to: params.to,
      actor: params.actor,
      reason: params.reason,
      owner: params.owner,
      next_action: params.next_action,
      blocker: params.blocker,
      next_review_at: params.next_review_at,
      metadata: params.metadata,
    };
  }

  /**
   * Check if reopening is allowed from current state
   * Per docs/04: MITIGATED can reopen to INVESTIGATING on new evidence
   */
  static canReopen(status: IncidentStatus): boolean {
    return status === "MITIGATED";
  }

  /**
   * Check if incident is in a terminal state
   */
  static isTerminal(status: IncidentStatus): boolean {
    return status === "CLOSED";
  }

  /**
   * Check if incident requires human approval before proceeding
   */
  static requiresApproval(status: IncidentStatus): boolean {
    return status === "AWAITING_APPROVAL";
  }

  /**
   * Get human-readable description of a status
   */
  static getStatusDescription(status: IncidentStatus): string {
    const descriptions: Record<IncidentStatus, string> = {
      DETECTED: "Impact detected, awaiting investigation",
      INVESTIGATING: "Root cause investigation in progress",
      PLANNING: "Evaluating recovery options",
      AWAITING_APPROVAL: "Awaiting human approval for proposed action",
      EXECUTING: "Executing approved recovery plan",
      MITIGATED: "Recovery plan executed, monitoring commitment",
      VERIFYING: "Verifying actual receipt and acceptance",
      CLOSED: "Incident resolved and verified",
      ESCALATED: "Escalated due to uncertain outcome or timeout",
      BLOCKED: "Blocked on missing evidence or external dependency",
    };
    return descriptions[status];
  }
}
