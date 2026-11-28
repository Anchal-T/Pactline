// ExecutionGateway Tests — Phase 2E
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ExecutionGateway,
  type ActionProposal,
  type ActionReceipt,
  type ActionReceiptStore,
  type ApprovalStore,
  type Approval,
  type PolicyConfig,
} from "./execution-gateway.js";
import { SandboxExternalAdapter } from "./sandbox-adapter.js";

describe("ExecutionGateway", () => {
  let gateway: ExecutionGateway;
  let receiptStore: ActionReceiptStore;
  let approvalStore: ApprovalStore;
  let adapter: SandboxExternalAdapter;
  let clock: () => Date;
  let currentTime: Date;

  const createProposal = (overrides: Partial<ActionProposal> = {}): ActionProposal => ({
    action_id: "act-001",
    action_class: "READ",
    action_type: "read_schedule",
    incident_id: "inc-001",
    actor: "operator-1",
    reason: "Test action",
    arguments: { test: "value" },
    ...overrides,
  });

  const createReceipt = (overrides: Partial<ActionReceipt> = {}): ActionReceipt => ({
    receipt_id: "rcpt-001",
    action_id: "act-001",
    idempotency_key: "action:abc123",
    status: "PENDING",
    action_type: "send_vendor_email",
    incident_id: "inc-001",
    actor: "operator-1",
    reason: "Test",
    arguments: {},
    approval_id: null,
    dispatched_at: null,
    confirmed_at: null,
    external_id: null,
    error: null,
    lease_expires_at: null,
    retry_count: 0,
    created_at: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    currentTime = new Date("2026-12-15T10:00:00Z");
    clock = () => currentTime;

    receiptStore = {
      exists: vi.fn().mockResolvedValue(false),
      getByIdempotencyKey: vi.fn().mockResolvedValue(null),
      insert: vi.fn().mockResolvedValue("rcpt-001"),
      markDispatching: vi.fn().mockResolvedValue(undefined),
      markConfirmed: vi.fn().mockResolvedValue(undefined),
      markUncertain: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
      getDispatchable: vi.fn().mockResolvedValue([]),
    };

    approvalStore = {
      getValid: vi.fn().mockResolvedValue(null),
    };

    adapter = new SandboxExternalAdapter();

    gateway = new ExecutionGateway(
      receiptStore,
      approvalStore,
      adapter,
      undefined,
      clock
    );
  });

  describe("Action authorization", () => {
    it("should authorize READ action without approval", async () => {
      const proposal = createProposal({
        action_class: "READ",
      });

      const result = await gateway.authorize(proposal);

      expect(result.authorized).toBe(true);
      expect(result.idempotency_key).toBeDefined();
    });

    it("should authorize DRAFT action without approval", async () => {
      const proposal = createProposal({
        action_class: "DRAFT",
        action_type: "draft_rfq",
      });

      const result = await gateway.authorize(proposal);

      expect(result.authorized).toBe(true);
    });

    it("should reject BINDING action without approval", async () => {
      const proposal = createProposal({
        action_class: "BINDING",
        action_type: "update_po",
      });

      const result = await gateway.authorize(proposal);

      expect(result.authorized).toBe(false);
      expect(result.error).toContain("approval");
      expect(result.escalation_reason).toBeDefined();
    });

    it("should reject BINDING action with expired approval", async () => {
      const proposal = createProposal({
        action_class: "BINDING",
        action_type: "update_po",
        approval_id: "appr-001",
      });

      vi.mocked(approvalStore.getValid).mockResolvedValue(null);

      const result = await gateway.authorize(proposal);

      expect(result.authorized).toBe(false);
      expect(result.error).toContain("expired");
    });

    it("should authorize BINDING action with valid approval", async () => {
      const approval: Approval = {
        approval_id: "appr-001",
        granted_by: "pm-1",
        granted_role: "PROCUREMENT_MANAGER",
        granted_at: new Date("2026-12-15T09:00:00Z"),
        expires_at: new Date("2026-12-15T12:00:00Z"),
        pins: { plan_rev: "v1" },
        scope: "update_po",
        subject_id: "po-001",
      };

      const proposal = createProposal({
        action_class: "BINDING",
        action_type: "update_po",
        approval_id: "appr-001",
      });

      vi.mocked(approvalStore.getValid).mockResolvedValue(approval);

      const result = await gateway.authorize(proposal);

      expect(result.authorized).toBe(true);
      expect(approvalStore.getValid).toHaveBeenCalledWith("appr-001", currentTime);
    });

    it("should reject approval with insufficient role", async () => {
      const approval: Approval = {
        approval_id: "appr-001",
        granted_by: "pm-1",
        granted_role: "PROCUREMENT_MANAGER",
        granted_at: new Date("2026-12-15T09:00:00Z"),
        expires_at: new Date("2026-12-15T12:00:00Z"),
        pins: {},
        scope: "technical_acceptance",
        subject_id: "sub-001",
      };

      const proposal = createProposal({
        action_class: "BINDING",
        action_type: "approve_submittal",
        approval_id: "appr-001",
        required_role: "ENGINEER_OF_RECORD",
      });

      vi.mocked(approvalStore.getValid).mockResolvedValue(approval);

      const result = await gateway.authorize(proposal);

      expect(result.authorized).toBe(false);
      expect(result.error).toContain("ENGINEER_OF_RECORD");
    });

    it("should reject action with tainted arguments and no approval", async () => {
      const proposal = createProposal({
        action_class: "EXTERNAL_WRITE",
        action_type: "send_vendor_email",
        template_id: "vendor_update", // Required for external write
        tainted_arguments: ["revised_date", "reason"],
      });

      const result = await gateway.authorize(proposal);

      expect(result.authorized).toBe(false);
      expect(result.error).toContain("tainted arguments");
      expect(result.escalation_reason).toContain("Taint policy");
    });

    it("should allow tainted arguments with approval", async () => {
      const approval: Approval = {
        approval_id: "appr-001",
        granted_by: "pm-1",
        granted_role: "PROCUREMENT_MANAGER",
        granted_at: new Date("2026-12-15T09:00:00Z"),
        expires_at: new Date("2026-12-15T12:00:00Z"),
        pins: {},
        scope: "send_vendor_email",
        subject_id: "email-001",
      };

      const proposal = createProposal({
        action_class: "EXTERNAL_WRITE",
        action_type: "send_vendor_email",
        approval_id: "appr-001",
        tainted_arguments: ["revised_date"],
        template_id: "vendor_update",
        recipient: "vendor@example.com",
      });

      vi.mocked(approvalStore.getValid).mockResolvedValue(approval);

      const result = await gateway.authorize(proposal);

      expect(result.authorized).toBe(true);
    });
  });

  describe("Idempotency", () => {
    it("should generate same key for identical proposals", async () => {
      const proposal1 = createProposal({
        action_id: "act-001",
        arguments: { a: 1, b: 2 },
      });

      const proposal2 = createProposal({
        action_id: "act-001",
        arguments: { b: 2, a: 1 }, // Different order
      });

      const result1 = await gateway.authorize(proposal1);
      const result2 = await gateway.authorize(proposal2);

      expect(result1.idempotency_key).toBe(result2.idempotency_key);
    });

    it("should reject already-confirmed action", async () => {
      const proposal = createProposal();
      const receipt = createReceipt({ status: "CONFIRMED" });

      vi.mocked(receiptStore.getByIdempotencyKey).mockResolvedValue(receipt);

      const result = await gateway.authorize(proposal);

      expect(result.authorized).toBe(false);
      expect(result.error).toContain("already confirmed");
    });

    it("should allow retry of failed action", async () => {
      const proposal = createProposal();
      const receipt = createReceipt({ status: "FAILED" });

      vi.mocked(receiptStore.getByIdempotencyKey).mockResolvedValue(receipt);

      const result = await gateway.authorize(proposal);

      expect(result.authorized).toBe(true);
      expect(result.receipt_id).toBe(receipt.receipt_id);
    });
  });

  describe("Receipt insertion", () => {
    it("should insert receipt with correct fields", async () => {
      const proposal = createProposal({
        action_class: "EXTERNAL_WRITE",
        action_type: "send_vendor_email",
        approval_id: "appr-001",
      });

      const receiptId = await gateway.insertReceipt(proposal, "action:xyz");

      expect(receiptId).toBe("rcpt-001");
      expect(receiptStore.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotency_key: "action:xyz",
          status: "PENDING",
          action_type: "send_vendor_email",
          approval_id: "appr-001",
          retry_count: 0,
        })
      );
    });
  });

  describe("Outbox processing (tickOutbox)", () => {
    it("should process pending receipts", async () => {
      const receipt = createReceipt({ status: "PENDING" });
      vi.mocked(receiptStore.getDispatchable).mockResolvedValue([receipt]);

      await gateway.tickOutbox(10);

      expect(receiptStore.markDispatching).toHaveBeenCalledWith(
        receipt.receipt_id,
        expect.any(Date)
      );
      expect(receiptStore.markConfirmed).toHaveBeenCalledWith(
        receipt.receipt_id,
        expect.stringContaining("ext-")
      );
    });

    it("should mark action as confirmed with external_id", async () => {
      const receipt = createReceipt();
      vi.mocked(receiptStore.getDispatchable).mockResolvedValue([receipt]);

      await gateway.tickOutbox(10);

      expect(receiptStore.markConfirmed).toHaveBeenCalled();
      const calls = vi.mocked(receiptStore.markConfirmed).mock.calls;
      expect(calls.length).toBeGreaterThan(0);

      const firstCall = calls[0];
      if (firstCall) {
        const [receiptId, externalId] = firstCall;
        expect(receiptId).toBe(receipt.receipt_id);
        expect(externalId).toMatch(/^ext-/);
      }
    });

    it("should fail action after max retries", async () => {
      const receipt = createReceipt({ retry_count: 3 });
      vi.mocked(receiptStore.getDispatchable).mockResolvedValue([receipt]);

      await gateway.tickOutbox(10);

      expect(receiptStore.markFailed).toHaveBeenCalledWith(
        receipt.receipt_id,
        "Max retries exceeded"
      );
      expect(receiptStore.markDispatching).not.toHaveBeenCalled();
    });

    it("should handle adapter failure", async () => {
      const receipt = createReceipt();
      vi.mocked(receiptStore.getDispatchable).mockResolvedValue([receipt]);

      adapter.setFaultConfig({ fail: true, failureMessage: "Network error" });

      await gateway.tickOutbox(10);

      expect(receiptStore.markFailed).toHaveBeenCalledWith(
        receipt.receipt_id,
        "Network error"
      );
    });
  });

  describe("Crash recovery (Scenario 7)", () => {
    it("should reconcile after crash and not duplicate write", async () => {
      const receipt = createReceipt({ idempotency_key: "action:crash-test" });

      // Simulate crash after write
      adapter.setFaultConfig({ crashAfterWrite: true });

      // First attempt - will crash after write (throws error)
      vi.mocked(receiptStore.getDispatchable).mockResolvedValueOnce([receipt]);
      await gateway.tickOutbox(10);

      // Adapter should have the operation recorded despite crash
      expect(adapter.hasOperation("action:crash-test")).toBe(true);

      // After crash, the reconcile() is called automatically
      // and should find the operation and confirm it
      expect(receiptStore.markConfirmed).toHaveBeenCalled();

      // Second attempt - should not create duplicate
      adapter.setFaultConfig({}); // Clear fault
      vi.mocked(receiptStore.getDispatchable).mockResolvedValueOnce([]);

      const countBefore = adapter.getOperationCount();
      await gateway.tickOutbox(10);

      // No new operations created
      expect(adapter.getOperationCount()).toBe(countBefore);
    });

    it("should mark as uncertain if reconciliation fails", async () => {
      const receipt = createReceipt();
      vi.mocked(receiptStore.getDispatchable).mockResolvedValue([receipt]);

      // Make adapter throw on execute and reconcile
      const badAdapter = new SandboxExternalAdapter();
      const mockExecute = vi.fn().mockRejectedValue(new Error("Network error"));
      const mockReconcile = vi.fn().mockRejectedValue(new Error("Cannot verify"));
      badAdapter.execute = mockExecute;
      badAdapter.reconcile = mockReconcile;

      const gatewayWithBadAdapter = new ExecutionGateway(
        receiptStore,
        approvalStore,
        badAdapter,
        undefined,
        clock
      );

      await gatewayWithBadAdapter.tickOutbox(10);

      // Should mark as uncertain after failed reconciliation
      expect(receiptStore.markUncertain).toHaveBeenCalledWith(
        receipt.receipt_id,
        expect.stringContaining("Cannot verify")
      );
    });
  });

  describe("Policy enforcement", () => {
    it("should reject external write without template", async () => {
      const proposal = createProposal({
        action_class: "EXTERNAL_WRITE",
        action_type: "send_vendor_email",
        // missing template_id
      });

      const result = await gateway.authorize(proposal);

      expect(result.authorized).toBe(false);
      expect(result.error).toContain("template");
    });

    it("should enforce recipient whitelist", async () => {
      const policy: PolicyConfig = {
        externalWriteRateLimit: 10,
        allowedRecipients: ["allowed@example.com"],
        leaseDurationSeconds: 300,
        maxRetries: 3,
      };

      const restrictiveGateway = new ExecutionGateway(
        receiptStore,
        approvalStore,
        adapter,
        policy,
        clock
      );

      const proposal = createProposal({
        action_class: "EXTERNAL_WRITE",
        action_type: "send_vendor_email",
        template_id: "vendor_update",
        recipient: "blocked@example.com",
      });

      const result = await restrictiveGateway.authorize(proposal);

      expect(result.authorized).toBe(false);
      expect(result.error).toContain("not in allowed list");
    });
  });
});
