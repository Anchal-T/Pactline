// Incident State Machine Tests — Phase 2C
import { describe, it, expect } from "vitest";
import { IncidentStateMachine } from "./incident-state-machine.js";
import type { IncidentState, TransitionRequest } from "./incident-state-machine.js";
import type { IncidentStatus } from "./entities.js";

describe("IncidentStateMachine", () => {
  // Helper to create a minimal valid incident state
  const createIncidentState = (overrides: Partial<IncidentState> = {}): IncidentState => ({
    id: "INC-0001",
    status: "DETECTED",
    version: 1,
    owner: "operator-1",
    next_action: "investigate",
    blocker: null,
    next_review_at: new Date(Date.now() + 3600000),
    accepted_qty: 0,
    required_qty: 2,
    has_valid_waiver: false,
    has_schedule_disposition: false,
    has_valid_approval: false,
    approval_expired: false,
    ...overrides,
  });

  describe("Valid transitions", () => {
    it("should allow DETECTED -> INVESTIGATING", () => {
      const state = createIncidentState({ status: "DETECTED" });
      const request: TransitionRequest = {
        to: "INVESTIGATING",
        actor: "operator-1",
        reason: "Starting investigation",
        owner: "operator-1",
        next_action: "gather facts",
        next_review_at: new Date(Date.now() + 3600000),
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(true);
      expect(result.from_status).toBe("DETECTED");
      expect(result.to_status).toBe("INVESTIGATING");
      expect(result.new_version).toBe(2);
    });

    it("should allow INVESTIGATING -> PLANNING", () => {
      const state = createIncidentState({ status: "INVESTIGATING" });
      const request: TransitionRequest = {
        to: "PLANNING",
        actor: "operator-1",
        reason: "Facts gathered, evaluating options",
        owner: "operator-1",
        next_action: "evaluate recovery options",
        next_review_at: new Date(Date.now() + 3600000),
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(true);
      expect(result.to_status).toBe("PLANNING");
    });

    it("should allow INVESTIGATING -> BLOCKED when evidence missing", () => {
      const state = createIncidentState({ status: "INVESTIGATING" });
      const request: TransitionRequest = {
        to: "BLOCKED",
        actor: "operator-1",
        reason: "Missing vendor response past deadline",
        owner: "operator-1",
        blocker: "Vendor silence on critical lead time",
        next_review_at: new Date(Date.now() + 86400000),
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(true);
      expect(result.to_status).toBe("BLOCKED");
    });

    it("should allow PLANNING -> AWAITING_APPROVAL for binding actions", () => {
      const state = createIncidentState({ status: "PLANNING" });
      const request: TransitionRequest = {
        to: "AWAITING_APPROVAL",
        actor: "operator-1",
        reason: "Binding substitution requires approval",
        owner: "operator-1",
        next_review_at: new Date(Date.now() + 86400000),
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(true);
      expect(result.to_status).toBe("AWAITING_APPROVAL");
    });

    it("should allow PLANNING -> EXECUTING for routine actions", () => {
      const state = createIncidentState({ status: "PLANNING" });
      const request: TransitionRequest = {
        to: "EXECUTING",
        actor: "operator-1",
        reason: "Only routine follow-ups needed",
        owner: "operator-1",
        next_action: "send follow-up",
        next_review_at: new Date(Date.now() + 3600000),
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(true);
      expect(result.to_status).toBe("EXECUTING");
    });

    it("should allow AWAITING_APPROVAL -> EXECUTING with valid approval", () => {
      const state = createIncidentState({
        status: "AWAITING_APPROVAL",
        has_valid_approval: true,
        approval_expired: false,
      });
      const request: TransitionRequest = {
        to: "EXECUTING",
        actor: "operator-1",
        reason: "Approval granted",
        owner: "operator-1",
        next_action: "send PO amendment",
        next_review_at: new Date(Date.now() + 3600000),
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(true);
      expect(result.to_status).toBe("EXECUTING");
    });

    it("should allow AWAITING_APPROVAL -> PLANNING when rejected", () => {
      const state = createIncidentState({ status: "AWAITING_APPROVAL" });
      const request: TransitionRequest = {
        to: "PLANNING",
        actor: "operator-1",
        reason: "Approval rejected, re-evaluating",
        owner: "operator-1",
        next_action: "find alternative",
        next_review_at: new Date(Date.now() + 3600000),
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(true);
      expect(result.to_status).toBe("PLANNING");
    });

    it("should allow EXECUTING -> MITIGATED when commitment confirmed", () => {
      const state = createIncidentState({ status: "EXECUTING" });
      const request: TransitionRequest = {
        to: "MITIGATED",
        actor: "operator-1",
        reason: "Credible vendor commitment received",
        owner: "operator-1",
        next_review_at: new Date(Date.now() + 86400000),
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(true);
      expect(result.to_status).toBe("MITIGATED");
    });

    it("should allow EXECUTING -> ESCALATED on uncertain outcome", () => {
      const state = createIncidentState({ status: "EXECUTING" });
      const request: TransitionRequest = {
        to: "ESCALATED",
        actor: "operator-1",
        reason: "Cannot verify external write",
        owner: "operator-1",
        blocker: "PO system timeout, state uncertain",
        next_review_at: new Date(Date.now() + 3600000),
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(true);
      expect(result.to_status).toBe("ESCALATED");
    });

    it("should allow MITIGATED -> VERIFYING when shipment received", () => {
      const state = createIncidentState({ status: "MITIGATED" });
      const request: TransitionRequest = {
        to: "VERIFYING",
        actor: "operator-1",
        reason: "Shipment received, verifying acceptance",
        owner: "operator-1",
        next_review_at: new Date(Date.now() + 3600000),
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(true);
      expect(result.to_status).toBe("VERIFYING");
    });

    it("should allow MITIGATED -> INVESTIGATING when new delay (reopen)", () => {
      const state = createIncidentState({ status: "MITIGATED" });
      const request: TransitionRequest = {
        to: "INVESTIGATING",
        actor: "operator-1",
        reason: "New delay reported, reopening incident",
        owner: "operator-1",
        next_action: "investigate new delay",
        next_review_at: new Date(Date.now() + 3600000),
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(true);
      expect(result.to_status).toBe("INVESTIGATING");
    });

    it("should allow VERIFYING -> CLOSED when accepted_qty meets requirement", () => {
      const state = createIncidentState({
        status: "VERIFYING",
        accepted_qty: 2,
        required_qty: 2,
      });
      const request: TransitionRequest = {
        to: "CLOSED",
        actor: "operator-1",
        reason: "Accepted quantity verified",
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(true);
      expect(result.to_status).toBe("CLOSED");
    });

    it("should allow VERIFYING -> CLOSED with valid waiver + schedule disposition", () => {
      const state = createIncidentState({
        status: "VERIFYING",
        accepted_qty: 1,
        required_qty: 2,
        has_valid_waiver: true,
        has_schedule_disposition: true,
      });
      const request: TransitionRequest = {
        to: "CLOSED",
        actor: "operator-1",
        reason: "Partial acceptance with valid waiver",
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(true);
      expect(result.to_status).toBe("CLOSED");
    });

    it("should allow VERIFYING -> PLANNING on inspection failure", () => {
      const state = createIncidentState({ status: "VERIFYING" });
      const request: TransitionRequest = {
        to: "PLANNING",
        actor: "operator-1",
        reason: "Inspection failed, need replacement",
        owner: "operator-1",
        next_action: "coordinate replacement",
        next_review_at: new Date(Date.now() + 3600000),
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(true);
      expect(result.to_status).toBe("PLANNING");
    });

    it("should allow ESCALATED -> PLANNING when human resolves", () => {
      const state = createIncidentState({ status: "ESCALATED" });
      const request: TransitionRequest = {
        to: "PLANNING",
        actor: "pm-1",
        reason: "Issue resolved by PM, re-planning",
        owner: "operator-1",
        next_action: "evaluate options",
        next_review_at: new Date(Date.now() + 3600000),
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(true);
      expect(result.to_status).toBe("PLANNING");
    });

    it("should allow BLOCKED -> INVESTIGATING when evidence arrives", () => {
      const state = createIncidentState({ status: "BLOCKED" });
      const request: TransitionRequest = {
        to: "INVESTIGATING",
        actor: "operator-1",
        reason: "Vendor response received",
        owner: "operator-1",
        next_action: "analyze response",
        next_review_at: new Date(Date.now() + 3600000),
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(true);
      expect(result.to_status).toBe("INVESTIGATING");
    });
  });

  describe("Invalid transitions", () => {
    it("should reject DETECTED -> PLANNING (must investigate first)", () => {
      const state = createIncidentState({ status: "DETECTED" });
      const request: TransitionRequest = {
        to: "PLANNING",
        actor: "operator-1",
        reason: "Skipping investigation",
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid transition");
    });

    it("should reject DETECTED -> CLOSED (must follow full lifecycle)", () => {
      const state = createIncidentState({ status: "DETECTED" });
      const request: TransitionRequest = {
        to: "CLOSED",
        actor: "operator-1",
        reason: "Attempting to close directly",
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid transition");
    });

    it("should reject CLOSED -> any state (terminal)", () => {
      const state = createIncidentState({ status: "CLOSED" });
      const request: TransitionRequest = {
        to: "INVESTIGATING",
        actor: "operator-1",
        reason: "Attempting to reopen closed incident",
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid transition");
    });

    it("should reject EXECUTING -> INVESTIGATING (must escalate or mitigate first)", () => {
      const state = createIncidentState({ status: "EXECUTING" });
      const request: TransitionRequest = {
        to: "INVESTIGATING",
        actor: "operator-1",
        reason: "Invalid backtrack",
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid transition");
    });
  });

  describe("Precondition enforcement", () => {
    it("should reject INVESTIGATING without owner", () => {
      const state = createIncidentState({ status: "DETECTED" });
      const request: TransitionRequest = {
        to: "INVESTIGATING",
        actor: "operator-1",
        reason: "Missing owner",
        next_action: "investigate",
        next_review_at: new Date(),
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(false);
      expect(result.error).toContain("owner");
    });

    it("should reject INVESTIGATING without next_action or blocker", () => {
      const state = createIncidentState({ status: "DETECTED" });
      const request: TransitionRequest = {
        to: "INVESTIGATING",
        actor: "operator-1",
        reason: "Missing action",
        owner: "operator-1",
        next_review_at: new Date(),
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(false);
      expect(result.error).toContain("next_action or blocker");
    });

    it("should reject INVESTIGATING without next_review_at", () => {
      const state = createIncidentState({ status: "DETECTED" });
      const request: TransitionRequest = {
        to: "INVESTIGATING",
        actor: "operator-1",
        reason: "Missing review date",
        owner: "operator-1",
        next_action: "investigate",
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(false);
      expect(result.error).toContain("next_review_at");
    });

    it("should accept BLOCKED with blocker instead of next_action", () => {
      const state = createIncidentState({ status: "INVESTIGATING" });
      const request: TransitionRequest = {
        to: "BLOCKED",
        actor: "operator-1",
        reason: "Waiting on vendor",
        owner: "operator-1",
        blocker: "Vendor silence",
        next_review_at: new Date(Date.now() + 86400000),
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(true);
    });

    it("should reject BLOCKED without blocker", () => {
      const state = createIncidentState({ status: "INVESTIGATING" });
      const request: TransitionRequest = {
        to: "BLOCKED",
        actor: "operator-1",
        reason: "Missing blocker",
        owner: "operator-1",
        next_review_at: new Date(),
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(false);
      expect(result.error).toContain("blocker");
    });

    it("should reject EXECUTING from AWAITING_APPROVAL without valid approval", () => {
      const state = createIncidentState({
        status: "AWAITING_APPROVAL",
        has_valid_approval: false,
      });
      const request: TransitionRequest = {
        to: "EXECUTING",
        actor: "operator-1",
        reason: "Attempting to execute without approval",
        owner: "operator-1",
        next_action: "execute",
        next_review_at: new Date(),
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(false);
      expect(result.error).toContain("valid approval");
    });

    it("should reject EXECUTING with expired approval", () => {
      const state = createIncidentState({
        status: "AWAITING_APPROVAL",
        has_valid_approval: true,
        approval_expired: true,
      });
      const request: TransitionRequest = {
        to: "EXECUTING",
        actor: "operator-1",
        reason: "Attempting with expired approval",
        owner: "operator-1",
        next_action: "execute",
        next_review_at: new Date(),
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(false);
      expect(result.error).toContain("expired approval");
    });

    it("should reject CLOSED without accepted_qty or valid waiver", () => {
      const state = createIncidentState({
        status: "VERIFYING",
        accepted_qty: 1,
        required_qty: 2,
        has_valid_waiver: false,
      });
      const request: TransitionRequest = {
        to: "CLOSED",
        actor: "operator-1",
        reason: "Attempting premature closure",
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(false);
      expect(result.error).toContain("accepted_qty >= required_qty OR valid waiver");
    });

    it("should reject CLOSED with waiver but no schedule disposition", () => {
      const state = createIncidentState({
        status: "VERIFYING",
        accepted_qty: 1,
        required_qty: 2,
        has_valid_waiver: true,
        has_schedule_disposition: false,
      });
      const request: TransitionRequest = {
        to: "CLOSED",
        actor: "operator-1",
        reason: "Waiver without schedule disposition",
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(false);
      expect(result.error).toContain("schedule disposition");
    });
  });

  describe("Invariant 8: Open incidents must have owner + review + action/blocker", () => {
    it("should validate compliant open state", () => {
      const state = createIncidentState({
        status: "INVESTIGATING",
        owner: "operator-1",
        next_action: "investigate",
        next_review_at: new Date(),
      });

      const error = IncidentStateMachine.validateInvariant8(state);

      expect(error).toBeNull();
    });

    it("should validate compliant state with blocker instead of action", () => {
      const state = createIncidentState({
        status: "BLOCKED",
        owner: "operator-1",
        blocker: "waiting on vendor",
        next_review_at: new Date(),
      });

      const error = IncidentStateMachine.validateInvariant8(state);

      expect(error).toBeNull();
    });

    it("should exempt CLOSED from invariant 8", () => {
      const state = createIncidentState({
        status: "CLOSED",
        owner: null,
        next_action: null,
        next_review_at: null,
      });

      const error = IncidentStateMachine.validateInvariant8(state);

      expect(error).toBeNull();
    });

    it("should reject open incident without owner", () => {
      const state = createIncidentState({
        status: "INVESTIGATING",
        owner: null,
      });

      const error = IncidentStateMachine.validateInvariant8(state);

      expect(error).toContain("owner");
    });

    it("should reject open incident without next_review_at", () => {
      const state = createIncidentState({
        status: "INVESTIGATING",
        next_review_at: null,
      });

      const error = IncidentStateMachine.validateInvariant8(state);

      expect(error).toContain("next_review_at");
    });

    it("should reject open incident without next_action or blocker", () => {
      const state = createIncidentState({
        status: "INVESTIGATING",
        next_action: null,
        blocker: null,
      });

      const error = IncidentStateMachine.validateInvariant8(state);

      expect(error).toContain("next_action or blocker");
    });
  });

  describe("Optimistic version checking", () => {
    it("should increment version on successful transition", () => {
      const state = createIncidentState({ version: 5 });
      const request: TransitionRequest = {
        to: "INVESTIGATING",
        actor: "operator-1",
        reason: "Starting investigation",
        owner: "operator-1",
        next_action: "gather facts",
        next_review_at: new Date(),
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.new_version).toBe(6);
    });

    it("should not increment version on failed transition", () => {
      const state = createIncidentState({ version: 3 });
      const request: TransitionRequest = {
        to: "CLOSED",
        actor: "operator-1",
        reason: "Invalid transition",
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(false);
      expect(result.new_version).toBeUndefined();
    });
  });

  describe("Audit trail", () => {
    it("should include audit data in result", () => {
      const state = createIncidentState();
      const request: TransitionRequest = {
        to: "INVESTIGATING",
        actor: "operator-1",
        reason: "Starting investigation",
        owner: "operator-1",
        next_action: "gather facts",
        next_review_at: new Date(),
        metadata: { trigger: "vendor_delay" },
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.audit.actor).toBe("operator-1");
      expect(result.audit.reason).toBe("Starting investigation");
      expect(result.audit.timestamp).toBeInstanceOf(Date);
      expect(result.audit.metadata).toEqual({ trigger: "vendor_delay" });
    });

    it("should include audit data even on failure", () => {
      const state = createIncidentState();
      const request: TransitionRequest = {
        to: "CLOSED",
        actor: "operator-1",
        reason: "Invalid attempt",
      };

      const result = IncidentStateMachine.transition(state, request);

      expect(result.success).toBe(false);
      expect(result.audit.actor).toBe("operator-1");
      expect(result.audit.reason).toBe("Invalid attempt");
    });
  });

  describe("Helper methods", () => {
    it("getValidNextStates should return allowed transitions", () => {
      const nextstates = IncidentStateMachine.getValidNextStates("INVESTIGATING");

      expect(nextstates).toContain("PLANNING");
      expect(nextstates).toContain("BLOCKED");
      expect(nextstates).not.toContain("CLOSED");
    });

    it("canReopen should only allow MITIGATED to reopen", () => {
      expect(IncidentStateMachine.canReopen("MITIGATED")).toBe(true);
      expect(IncidentStateMachine.canReopen("CLOSED")).toBe(false);
      expect(IncidentStateMachine.canReopen("EXECUTING")).toBe(false);
    });

    it("isTerminal should identify CLOSED", () => {
      expect(IncidentStateMachine.isTerminal("CLOSED")).toBe(true);
      expect(IncidentStateMachine.isTerminal("MITIGATED")).toBe(false);
    });

    it("requiresApproval should identify AWAITING_APPROVAL", () => {
      expect(IncidentStateMachine.requiresApproval("AWAITING_APPROVAL")).toBe(true);
      expect(IncidentStateMachine.requiresApproval("EXECUTING")).toBe(false);
    });

    it("getStatusDescription should return human-readable text", () => {
      const desc = IncidentStateMachine.getStatusDescription("INVESTIGATING");
      expect(desc).toContain("investigation");
      expect(desc.length).toBeGreaterThan(0);
    });

    it("buildTransitionRequest should construct valid request", () => {
      const request = IncidentStateMachine.buildTransitionRequest({
        to: "INVESTIGATING",
        actor: "operator-1",
        reason: "Test",
        owner: "operator-1",
        next_action: "test action",
        next_review_at: new Date(),
        metadata: { test: true },
      });

      expect(request.to).toBe("INVESTIGATING");
      expect(request.actor).toBe("operator-1");
      expect(request.owner).toBe("operator-1");
      expect(request.metadata).toEqual({ test: true });
    });
  });
});
