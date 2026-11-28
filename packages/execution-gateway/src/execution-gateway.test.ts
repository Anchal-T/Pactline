// ExecutionGateway Tests — Phase 2E
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ExecutionGateway,
  MemoryActionReceiptStore,
  type ActionProposal,
  type Approval,
  type ApprovalStore,
  type PolicyConfig,
  type RevisionPins,
  type RevisionReader,
} from "./execution-gateway.js";
import { SandboxExternalAdapter } from "./sandbox-adapter.js";

const VENDOR = "vendor@example.com";

describe("ExecutionGateway", () => {
  let now: Date;
  let receipts: MemoryActionReceiptStore;
  let approvals: Map<string, Approval>;
  let current: Map<string, RevisionPins>;
  let adapter: SandboxExternalAdapter;
  let gateway: ExecutionGateway;

  const approvalStore: ApprovalStore = { getValid: async (id, at) => { const a = approvals.get(id); return a && a.expires_at > at ? a : null; } };
  const revisions: RevisionReader = { current: async (s) => current.get(s) ?? null };

  const make = (policy: Partial<PolicyConfig> = {}) =>
    new ExecutionGateway({ receipts, approvals: approvalStore, revisions, adapter, policy: { allowedRecipients: [VENDOR], ...policy }, clock: () => now });

  const proposal = (o: Partial<ActionProposal> = {}): ActionProposal => ({
    action_id: "act-001",
    action_type: "read_schedule",
    incident_id: "inc-001",
    actor: "operator-1",
    reason: "Test action",
    arguments: { test: "value" },
    ...o,
  });

  const binding = (o: Partial<ActionProposal> = {}) =>
    proposal({ action_type: "update_po", subject_id: "pol-118", approval_id: "appr-001", arguments: { qty: 2 }, ...o });

  const email = (o: Partial<ActionProposal> = {}) =>
    proposal({ action_type: "send_vendor_email", recipient: VENDOR, template_id: "vendor_update", subject_id: "pol-118", arguments: { body: "Please confirm" }, ...o });

  const approval = (o: Partial<Approval> = {}): Approval => ({
    approval_id: "appr-001",
    granted_by: "pm-1",
    granted_role: "PROCUREMENT_MANAGER",
    granted_at: new Date("2026-12-15T09:00:00Z"),
    expires_at: new Date("2026-12-15T12:00:00Z"),
    pins: { offer_rev: "2", plan_rev: "v1" },
    scope: "update_po",
    subject_id: "pol-118",
    ...o,
  });

  beforeEach(() => {
    now = new Date("2026-12-15T10:00:00Z");
    receipts = new MemoryActionReceiptStore(() => now);
    approvals = new Map();
    current = new Map([["pol-118", { offer_rev: "2", plan_rev: "v1" }]]);
    adapter = new SandboxExternalAdapter();
    gateway = make();
  });

  describe("trusted action rules", () => {
    it("authorizes READ and DRAFT without approval", async () => {
      expect((await gateway.authorize(proposal())).authorized).toBe(true);
      expect((await gateway.authorize(proposal({ action_type: "draft_rfq" }))).authorized).toBe(true);
    });

    it("rejects a binding action relabelled as READ", async () => {
      const r = await gateway.authorize(binding({ action_class: "READ", approval_id: undefined }));
      expect(r.authorized).toBe(false);
      expect(r.error).toContain("BINDING");
    });

    it("treats a binding action as binding even when no class is given", async () => {
      const r = await gateway.authorize(binding({ approval_id: undefined }));
      expect(r.authorized).toBe(false);
      expect(r.error).toContain("approval");
    });

    it("rejects unknown action types", async () => {
      expect((await gateway.authorize(proposal({ action_type: "wire_money" }))).error).toContain("Unknown action type");
    });

    it("stores the trusted class on the receipt", async () => {
      approvals.set("appr-001", approval());
      const r = await gateway.enqueue(binding());
      expect(receipts.rows.get(r.receipt_id!)?.action_class).toBe("BINDING");
    });
  });

  describe("approval matching", () => {
    beforeEach(() => approvals.set("appr-001", approval()));

    it("authorizes a binding action with a matching approval", async () => {
      expect((await gateway.authorize(binding())).authorized).toBe(true);
    });

    it("rejects an expired approval", async () => {
      now = new Date("2026-12-15T13:00:00Z");
      expect((await gateway.authorize(binding())).error).toContain("expired");
    });

    it("rejects an approval for another subject", async () => {
      current.set("pol-200", { offer_rev: "2", plan_rev: "v1" });
      expect((await gateway.authorize(binding({ subject_id: "pol-200" }))).error).toContain("not pol-200");
    });

    it("rejects an approval for another operation", async () => {
      approvals.set("appr-001", approval({ scope: "expedite_po" }));
      expect((await gateway.authorize(binding())).error).toContain("scope");
    });

    it("rejects an approval whose pinned revision has moved", async () => {
      current.set("pol-118", { offer_rev: "3", plan_rev: "v1" });
      expect((await gateway.authorize(binding())).error).toContain("offer_rev");
    });

    it("takes the required role from the rule, not the proposal", async () => {
      approvals.set("appr-002", approval({ approval_id: "appr-002", scope: "substitute_product" }));
      const r = await gateway.authorize(binding({ action_type: "substitute_product", approval_id: "appr-002" }));
      expect(r.authorized).toBe(false);
      expect(r.error).toContain("ENGINEER_OF_RECORD");
    });

    it("rechecks the approval when a receipt already exists", async () => {
      const first = await gateway.enqueue(binding());
      expect(first.authorized).toBe(true);
      now = new Date("2026-12-15T13:00:00Z");
      const retry = await gateway.authorize(binding());
      expect(retry.authorized).toBe(false);
      expect(retry.error).toContain("expired");
    });
  });

  describe("taint policy", () => {
    it("rejects tainted arguments without approval", async () => {
      const r = await gateway.authorize(email({ tainted_arguments: ["body"] }));
      expect(r.authorized).toBe(false);
      expect(r.escalation_reason).toContain("Taint policy");
    });

    it("rejects an invented approval id for tainted arguments", async () => {
      const r = await gateway.authorize(email({ tainted_arguments: ["body"], approval_id: "made-up" }));
      expect(r.authorized).toBe(false);
      expect(r.error).toContain("not found");
    });

    it("allows tainted arguments with a verified approval for that send", async () => {
      approvals.set("appr-003", approval({ approval_id: "appr-003", scope: "send_vendor_email" }));
      expect((await gateway.authorize(email({ tainted_arguments: ["body"], approval_id: "appr-003" }))).authorized).toBe(true);
    });
  });

  describe("outbound writes", () => {
    it("rejects a missing recipient", async () => {
      expect((await gateway.authorize(email({ recipient: undefined }))).error).toContain("recipient");
    });

    it("rejects every recipient when the allow-list is empty", async () => {
      expect((await make({ allowedRecipients: [] }).authorize(email())).error).toContain("not in allowed list");
    });

    it("rejects a recipient outside the allow-list", async () => {
      expect((await gateway.authorize(email({ recipient: "blocked@example.com" }))).error).toContain("not in allowed list");
    });

    it("requires a template", async () => {
      expect((await gateway.authorize(email({ template_id: undefined }))).error).toContain("template");
    });

    it("rejects a destination smuggled into arguments", async () => {
      expect((await gateway.authorize(email({ arguments: { to: "other@example.com" } }))).error).toContain("arguments");
    });

    it("keeps the checked recipient and template on the receipt and in the adapter call", async () => {
      const r = await gateway.enqueue(email());
      const row = receipts.rows.get(r.receipt_id!)!;
      expect([row.recipient, row.template_id]).toEqual([VENDOR, "vendor_update"]);
      await gateway.tickOutbox();
      const op = adapter.getOperation(row.idempotency_key)!;
      expect([op.recipient, op.template_id]).toEqual([VENDOR, "vendor_update"]);
    });

    it("enforces the hourly limit per recipient", async () => {
      const g = make({ externalWriteRateLimit: 1 });
      expect((await g.enqueue(email({ action_id: "a1" }))).authorized).toBe(true);
      const second = await g.enqueue(email({ action_id: "a2" }));
      expect(second.authorized).toBe(false);
      expect(second.error).toContain("Rate limit");
      now = new Date("2026-12-15T11:00:01Z");
      expect((await g.enqueue(email({ action_id: "a3" }))).authorized).toBe(true);
    });

    it("does not spend the allowance on a retry of the same action", async () => {
      const g = make({ externalWriteRateLimit: 1 });
      const a = await g.enqueue(email());
      const b = await g.enqueue(email());
      expect(b.authorized).toBe(true);
      expect(b.receipt_id).toBe(a.receipt_id);
    });
  });

  describe("idempotency keys", () => {
    it("ignores key order at every depth", () => {
      const a = gateway.generateIdempotencyKey(proposal({ arguments: { payload: { a: 1, b: 2 }, z: 1 } }));
      const b = gateway.generateIdempotencyKey(proposal({ arguments: { z: 1, payload: { b: 2, a: 1 } } }));
      expect(a).toBe(b);
    });

    it("keeps array order significant", () => {
      expect(gateway.generateIdempotencyKey(proposal({ arguments: { l: [1, 2] } }))).not.toBe(gateway.generateIdempotencyKey(proposal({ arguments: { l: [2, 1] } })));
    });

    it("separates later actions with the same content", () => {
      expect(gateway.generateIdempotencyKey(email({ action_id: "a1" }))).not.toBe(gateway.generateIdempotencyKey(email({ action_id: "a2" })));
    });

    it("separates destinations and templates", () => {
      const base = gateway.generateIdempotencyKey(email());
      expect(gateway.generateIdempotencyKey(email({ recipient: "x@example.com" }))).not.toBe(base);
      expect(gateway.generateIdempotencyKey(email({ template_id: "other" }))).not.toBe(base);
    });

    it("lets a later follow-up with the same text through after the first is confirmed", async () => {
      await gateway.enqueue(email({ action_id: "a1" }));
      await gateway.tickOutbox();
      expect((await gateway.enqueue(email({ action_id: "a2" }))).authorized).toBe(true);
    });

    it("rejects a repeat of an action already confirmed", async () => {
      await gateway.enqueue(email());
      await gateway.tickOutbox();
      expect((await gateway.enqueue(email())).error).toContain("already confirmed");
    });
  });

  describe("outbox processing", () => {
    it("confirms a pending receipt with its external id", async () => {
      const r = await gateway.enqueue(proposal());
      await gateway.tickOutbox();
      const row = receipts.rows.get(r.receipt_id!)!;
      expect(row.status).toBe("CONFIRMED");
      expect(row.external_id).toMatch(/^ext-/);
    });

    it("marks a known failure FAILED", async () => {
      const r = await gateway.enqueue(proposal());
      adapter.setFaultConfig({ fail: true, failureMessage: "Network error" });
      await gateway.tickOutbox();
      expect(receipts.rows.get(r.receipt_id!)).toMatchObject({ status: "FAILED", error: "Network error" });
    });

    it("fails a receipt after max retries", async () => {
      const g = make({ maxRetries: 1 });
      const r = await g.enqueue(proposal());
      const row = receipts.rows.get(r.receipt_id!)!;
      receipts.rows.set(row.receipt_id, { ...row, retry_count: 1 });
      await g.tickOutbox();
      expect(receipts.rows.get(r.receipt_id!)?.error).toBe("Max retries exceeded");
    });
  });

  describe("crash recovery (scenario 7)", () => {
    it("reconciles a stranded DISPATCHING receipt instead of writing again", async () => {
      const r = await gateway.enqueue(email());
      // Worker 1 writes, then dies before recording the result.
      adapter.setFaultConfig({ crashAfterWrite: true });
      const reconcile = vi.spyOn(adapter, "reconcile").mockRejectedValueOnce(new Error("worker died"));
      const row = receipts.rows.get(r.receipt_id!)!;
      await receipts.markDispatching(row.receipt_id, new Date(now.getTime() + 300_000));
      await adapter.execute({ ...row, status: "DISPATCHING" }).catch(() => undefined);
      expect(adapter.getOperationCount()).toBe(1);
      reconcile.mockRestore();

      // Lease expires; worker 2 picks the receipt up.
      adapter.setFaultConfig({});
      now = new Date(now.getTime() + 301_000);
      const execute = vi.spyOn(adapter, "execute");
      await gateway.tickOutbox();

      expect(execute).not.toHaveBeenCalled();
      expect(adapter.getOperationCount()).toBe(1);
      expect(receipts.rows.get(r.receipt_id!)?.status).toBe("CONFIRMED");
    });

    it("retries a stranded receipt only when reconcile proves nothing was written", async () => {
      const r = await gateway.enqueue(email());
      await receipts.markDispatching(r.receipt_id!, new Date(now.getTime() + 1000));
      now = new Date(now.getTime() + 2000);
      await gateway.tickOutbox();
      expect(adapter.getOperationCount()).toBe(1);
      expect(receipts.rows.get(r.receipt_id!)?.status).toBe("CONFIRMED");
    });

    it("escalates a stranded receipt as UNCERTAIN when the external state cannot be read", async () => {
      const r = await gateway.enqueue(email());
      await receipts.markDispatching(r.receipt_id!, new Date(now.getTime() + 1000));
      now = new Date(now.getTime() + 2000);
      adapter.setFaultConfig({ reconcileFails: true });
      const execute = vi.spyOn(adapter, "execute");
      await gateway.tickOutbox();
      expect(execute).not.toHaveBeenCalled();
      expect(receipts.rows.get(r.receipt_id!)?.status).toBe("UNCERTAIN");
    });

    it("confirms through reconcile when the adapter crashes after writing in the same worker", async () => {
      const r = await gateway.enqueue(email());
      adapter.setFaultConfig({ crashAfterWrite: true });
      await gateway.tickOutbox();
      expect(receipts.rows.get(r.receipt_id!)?.status).toBe("CONFIRMED");
      expect(adapter.getOperationCount()).toBe(1);
    });
  });
});
