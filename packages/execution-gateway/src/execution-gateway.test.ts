// ExecutionGateway Tests — Phase 2E
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ExecutionGateway,
  MemoryGatewayStore,
  type ActionProposal,
  type Approval,
  type ExecutionResult,
  type ExternalAdapter,
  type PolicyConfig,
} from "./execution-gateway.js";
import { SandboxExternalAdapter } from "./sandbox-adapter.js";

const VENDOR = "vendor@example.com";

describe("ExecutionGateway", () => {
  let now: Date;
  let store: MemoryGatewayStore;
  let adapter: SandboxExternalAdapter;
  let gateway: ExecutionGateway;

  const make = (policy: Partial<PolicyConfig> = {}) =>
    new ExecutionGateway({ store, adapter, policy: { allowedRecipients: [VENDOR], ...policy }, clock: () => now });

  const row = (id: string | undefined) => store.receipts.get(id!)!;

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

  /** Simulates a worker that claimed the receipt and died before recording the result. */
  const strand = async (receiptId: string) => {
    await store.transaction((tx) => tx.claim(receiptId, now, new Date(now.getTime() + 1000)));
    now = new Date(now.getTime() + 2000);
  };

  beforeEach(() => {
    now = new Date("2026-12-15T10:00:00Z");
    store = new MemoryGatewayStore(() => now);
    store.revisions.set("pol-118", { offer_rev: "2", plan_rev: "v1" });
    store.offers.set("2", { offer_rev: "2", expires_at: new Date("2026-12-16T00:00:00Z") });
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
      expect((await gateway.authorize(binding({ approval_id: undefined }))).error).toContain("approval");
    });

    it("rejects unknown action types", async () => {
      expect((await gateway.authorize(proposal({ action_type: "wire_money" }))).error).toContain("Unknown action type");
    });

    it("stores the trusted class on the receipt", async () => {
      store.approvals.set("appr-001", approval());
      expect(row((await gateway.enqueue(binding())).receipt_id).action_class).toBe("BINDING");
    });
  });

  describe("approval matching", () => {
    beforeEach(() => store.approvals.set("appr-001", approval()));

    it("authorizes a binding action with a matching approval", async () => {
      expect((await gateway.authorize(binding())).authorized).toBe(true);
    });

    it("checks revisions before taking the approval lock", async () => {
      const revisions = vi.spyOn(store.revisions, "get");
      const approvals = vi.spyOn(store.approvals, "get");

      expect((await gateway.enqueue(binding())).authorized).toBe(true);
      expect(revisions.mock.invocationCallOrder[0]).toBeLessThan(approvals.mock.invocationCallOrder[0]!);
    });

    it("rejects an expired approval", async () => {
      now = new Date("2026-12-15T13:00:00Z");
      expect((await gateway.authorize(binding())).error).toContain("expired");
    });

    it("rejects an approval for another subject", async () => {
      store.revisions.set("pol-200", { offer_rev: "2", plan_rev: "v1" });
      expect((await gateway.authorize(binding({ subject_id: "pol-200" }))).error).toContain("not pol-200");
    });

    it("rejects an approval for another operation", async () => {
      store.approvals.set("appr-001", approval({ scope: "expedite_po" }));
      expect((await gateway.authorize(binding())).error).toContain("scope");
    });

    it("rejects an approval whose pinned revision has moved", async () => {
      store.revisions.set("pol-118", { offer_rev: "3", plan_rev: "v1" });
      expect((await gateway.authorize(binding())).error).toContain("offer_rev");
    });

    it("takes the required role from the rule, not the proposal", async () => {
      store.approvals.set("appr-002", approval({ approval_id: "appr-002", scope: "substitute_product" }));
      const r = await gateway.authorize(binding({ action_type: "substitute_product", approval_id: "appr-002" }));
      expect(r.authorized).toBe(false);
      expect(r.error).toContain("ENGINEER_OF_RECORD");
    });

    it("rechecks the approval when a receipt already exists", async () => {
      expect((await gateway.enqueue(binding())).authorized).toBe(true);
      now = new Date("2026-12-15T13:00:00Z");
      expect((await gateway.authorize(binding())).error).toContain("expired");
    });
  });

  describe("approval in the enqueue transaction and at dispatch", () => {
    beforeEach(() => store.approvals.set("appr-001", approval()));

    it("does not queue against a revision committed while the enqueue waited", async () => {
      // A revision writer holds the lock first; the enqueue's checks and insert run after it commits.
      let release!: () => void;
      const writer = store.transaction(
        () =>
          new Promise<void>((resolve) => {
            release = () => {
              store.revisions.set("pol-118", { offer_rev: "3", plan_rev: "v1" });
              resolve();
            };
          }),
      );
      const pending = gateway.enqueue(binding());
      await Promise.resolve();
      release();
      await writer;
      const r = await pending;
      expect(r.authorized).toBe(false);
      expect(r.error).toContain("offer_rev");
      expect(store.receipts.size).toBe(0);
    });

    it("rolls the insert back when the transaction throws", async () => {
      await expect(
        store.transaction(async (tx) => {
          await tx.insertReceipt({ ...row(undefined), idempotency_key: "k" } as never);
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect(store.receipts.size).toBe(0);
    });

    it("refuses to dispatch after the approval expires", async () => {
      const r = await gateway.enqueue(binding());
      now = new Date("2026-12-15T12:30:00Z");
      const execute = vi.spyOn(adapter, "execute");
      await gateway.tickOutbox();
      expect(execute).not.toHaveBeenCalled();
      expect(row(r.receipt_id)).toMatchObject({ status: "FAILED" });
      expect(row(r.receipt_id).error).toContain("Approval no longer valid");
    });

    it("refuses to dispatch after a pinned revision changes", async () => {
      const r = await gateway.enqueue(binding());
      await store.setRevisions("pol-118", { offer_rev: "3", plan_rev: "v1" });
      await gateway.tickOutbox();
      expect(adapter.getOperationCount()).toBe(0);
      expect(row(r.receipt_id).error).toContain("offer_rev");
    });

    it("re-verifies a tainted outbound write at dispatch", async () => {
      store.approvals.set("appr-003", approval({ approval_id: "appr-003", scope: "send_vendor_email" }));
      const r = await gateway.enqueue(email({ tainted_arguments: ["body"], approval_id: "appr-003" }));
      store.approvals.delete("appr-003");
      await gateway.tickOutbox();
      expect(adapter.getOperationCount()).toBe(0);
      expect(row(r.receipt_id).status).toBe("FAILED");
    });

    it("dispatches a binding action whose approval still holds", async () => {
      const r = await gateway.enqueue(binding());
      await gateway.tickOutbox();
      expect(row(r.receipt_id).status).toBe("CONFIRMED");
    });
  });

  describe("supplier offer expiry", () => {
    beforeEach(() => store.approvals.set("appr-001", approval()));

    it("rejects an expired offer at enqueue even while the approval holds", async () => {
      store.offers.set("2", { offer_rev: "2", expires_at: new Date("2026-12-15T09:30:00Z") });
      const r = await gateway.enqueue(binding());
      expect(r.authorized).toBe(false);
      expect(r.error).toBe("Supplier offer 2 expired at 2026-12-15T09:30:00.000Z");
      expect(store.receipts.size).toBe(0);
    });

    it("rejects an offer pin that cannot be resolved", async () => {
      store.offers.clear();
      expect((await gateway.enqueue(binding())).error).toBe("Supplier offer 2 not found");
    });

    it("fails the receipt at dispatch when the offer expires after enqueue", async () => {
      store.offers.set("2", { offer_rev: "2", expires_at: new Date("2026-12-15T11:00:00Z") });
      const r = await gateway.enqueue(binding());
      expect(r.authorized).toBe(true);
      now = new Date("2026-12-15T11:30:00Z");
      await gateway.tickOutbox();
      expect(row(r.receipt_id)).toMatchObject({ status: "FAILED", error: "Approval no longer valid at dispatch: Supplier offer 2 expired at 2026-12-15T11:00:00.000Z" });
      expect(adapter.getOperationCount()).toBe(0);
    });

    it("needs no offer when the approval pins none", async () => {
      store.offers.clear();
      store.revisions.set("pol-118", { plan_rev: "v1" });
      store.approvals.set("appr-001", approval({ pins: { plan_rev: "v1" } }));
      expect((await gateway.enqueue(binding())).authorized).toBe(true);
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
      store.approvals.set("appr-003", approval({ approval_id: "appr-003", scope: "send_vendor_email" }));
      expect((await gateway.authorize(email({ tainted_arguments: ["body"], approval_id: "appr-003" }))).authorized).toBe(true);
    });
  });

  describe("non-outbound actions", () => {
    it.each([
      ["a recipient", { recipient: "attacker@evil.example" }, "recipient"],
      ["a template", { template_id: "vendor_update" }, "template_id"],
      ["a destination in arguments", { arguments: { to: "attacker@evil.example" } }, "arguments.to"],
    ])("denies a draft that carries %s", async (_, o, field) => {
      const r = await gateway.enqueue(proposal({ action_type: "draft_vendor_email", ...o }));
      expect(r.authorized).toBe(false);
      expect(r.error).toBe(`draft_vendor_email is not an outbound action and cannot carry ${field}`);
      expect(store.receipts.size).toBe(0);
    });

    it("denies a read or a binding action that carries a recipient", async () => {
      store.approvals.set("appr-001", approval());
      expect((await gateway.enqueue(proposal({ action_type: "read_po", recipient: VENDOR }))).authorized).toBe(false);
      expect((await gateway.enqueue(binding({ recipient: VENDOR }))).error).toContain("not an outbound action");
    });

    it("logs READ and DRAFT as CONFIRMED receipts that never reach the adapter", async () => {
      const execute = vi.spyOn(adapter, "execute");
      const read = await gateway.enqueue(proposal({ action_type: "read_po" }));
      const draft = await gateway.enqueue(proposal({ action_id: "act-002", action_type: "draft_vendor_email" }));
      await gateway.tickOutbox();
      expect(execute).not.toHaveBeenCalled();
      expect([row(read.receipt_id).status, row(draft.receipt_id).status]).toEqual(["CONFIRMED", "CONFIRMED"]);
      expect(row(read.receipt_id).external_id).toBeNull();
    });

    it("fails a READ receipt left dispatchable instead of executing it", async () => {
      const r = await gateway.enqueue(proposal());
      store.receipts.set(r.receipt_id!, { ...row(r.receipt_id), status: "PENDING", confirmed_at: null });
      const execute = vi.spyOn(adapter, "execute");
      await gateway.tickOutbox();
      expect(execute).not.toHaveBeenCalled();
      expect(row(r.receipt_id)).toMatchObject({ status: "FAILED", error: "READ actions are never dispatched" });
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
      expect([row(r.receipt_id).recipient, row(r.receipt_id).template_id]).toEqual([VENDOR, "vendor_update"]);
      await gateway.tickOutbox();
      const op = adapter.getOperation(row(r.receipt_id).idempotency_key)!;
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

    it("holds the limit when distinct follow-ups are enqueued concurrently", async () => {
      const g = make({ externalWriteRateLimit: 1 });
      const results = await Promise.all(["a1", "a2", "a3"].map((id) => g.enqueue(email({ action_id: id }))));
      expect(results.filter((r) => r.authorized)).toHaveLength(1);
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

    it("creates one receipt for concurrent enqueues of the same action", async () => {
      const [a, b] = await Promise.all([gateway.enqueue(email()), gateway.enqueue(email())]);
      expect(a.receipt_id).toBe(b.receipt_id);
      expect(store.receipts.size).toBe(1);
    });
  });

  describe("outbox processing", () => {
    it("confirms a pending receipt with its external id", async () => {
      const r = await gateway.enqueue(email());
      await gateway.tickOutbox();
      expect(row(r.receipt_id).status).toBe("CONFIRMED");
      expect(row(r.receipt_id).external_id).toMatch(/^ext-/);
    });

    it("marks a known failure FAILED", async () => {
      const r = await gateway.enqueue(email());
      adapter.setFaultConfig({ fail: true, failureMessage: "Network error" });
      await gateway.tickOutbox();
      expect(row(r.receipt_id)).toMatchObject({ status: "FAILED", error: "Network error" });
    });

    it("fails a receipt once its attempts exceed the budget", async () => {
      const g = make({ maxRetries: 1 });
      const r = await g.enqueue(email());
      store.receipts.set(r.receipt_id!, { ...row(r.receipt_id), retry_count: 1 });
      await g.tickOutbox();
      expect(row(r.receipt_id).error).toBe("Max retries exceeded");
      expect(adapter.getOperationCount()).toBe(0);
    });

    it("executes a receipt once when workers overlap", async () => {
      const r = await gateway.enqueue(email());
      const execute = vi.spyOn(adapter, "execute");
      const worker2 = make();
      await Promise.all([gateway.tickOutbox(), worker2.tickOutbox(), gateway.tickOutbox()]);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(adapter.getOperationCount(row(r.receipt_id).idempotency_key)).toBe(1);
      expect(row(r.receipt_id).status).toBe("CONFIRMED");
    });

    it("skips a receipt another worker holds under a live lease", async () => {
      const r = await gateway.enqueue(email());
      await store.transaction((tx) => tx.claim(r.receipt_id!, now, new Date(now.getTime() + 60_000)));
      const execute = vi.spyOn(adapter, "execute");
      await gateway.tickOutbox();
      expect(execute).not.toHaveBeenCalled();
      expect(await store.transaction((tx) => tx.claim(r.receipt_id!, now, now))).toBeNull();
    });
  });

  describe("lease fencing", () => {
    it("ignores a late result from a worker whose lease expired mid-execute", async () => {
      const r = await gateway.enqueue(email());
      let entered!: () => void;
      const inExecute = new Promise<void>((resolve) => (entered = resolve));
      let release!: (result: ExecutionResult) => void;
      const lateResult = new Promise<ExecutionResult>((resolve) => (release = resolve));
      const slow: ExternalAdapter = {
        execute: async (receipt) => {
          await adapter.execute(receipt);
          entered();
          return lateResult;
        },
        reconcile: (key) => adapter.reconcile(key),
      };
      const workerA = new ExecutionGateway({ store, adapter: slow, policy: { allowedRecipients: [VENDOR] }, clock: () => now });

      const runA = workerA.tickOutbox();
      await inExecute;
      now = new Date(now.getTime() + 301_000);
      await make().tickOutbox();
      expect(row(r.receipt_id)).toMatchObject({ status: "CONFIRMED", external_id: "ext-1", retry_count: 2 });

      release({ success: false, error: "late failure" });
      await runA;
      expect(row(r.receipt_id)).toMatchObject({ status: "CONFIRMED", external_id: "ext-1", error: null });
      expect(await store.transaction((tx) => tx.markConfirmed({ receipt_id: r.receipt_id!, retry_count: 1 }, "ext-stale"))).toBe(false);
      expect(adapter.getOperationCount()).toBe(1);
    });

    it("rejects every result write from a superseded claim while the new holder dispatches", async () => {
      const id = (await gateway.enqueue(email())).receipt_id!;
      const a = (await store.transaction((tx) => tx.claim(id, now, new Date(now.getTime() + 1000))))!.receipt;
      now = new Date(now.getTime() + 2000);
      const b = (await store.transaction((tx) => tx.claim(id, now, new Date(now.getTime() + 300_000))))!.receipt;

      const stale = await store.transaction(async (tx) => [
        await tx.markConfirmed(a, "ext-stale"),
        await tx.markFailed(a, "stale failure"),
        await tx.markUncertain(a, "stale uncertain"),
      ]);
      expect(stale).toEqual([false, false, false]);
      expect(row(id)).toMatchObject({ status: "DISPATCHING", retry_count: 2, error: null, external_id: null });

      expect(await store.transaction((tx) => tx.markConfirmed(b, "ext-b"))).toBe(true);
      expect(row(id)).toMatchObject({ status: "CONFIRMED", external_id: "ext-b" });
    });
  });

  describe("crash recovery (scenario 7)", () => {
    it("reconciles a stranded receipt instead of writing again", async () => {
      const r = await gateway.enqueue(email());
      // Worker 1 claims, writes, then dies before recording the result.
      await store.transaction((tx) => tx.claim(r.receipt_id!, now, new Date(now.getTime() + 300_000)));
      await adapter.execute(row(r.receipt_id));
      expect(adapter.getOperationCount()).toBe(1);

      // Lease expires; worker 2 picks the receipt up.
      now = new Date(now.getTime() + 301_000);
      const execute = vi.spyOn(adapter, "execute");
      await gateway.tickOutbox();

      expect(execute).not.toHaveBeenCalled();
      expect(adapter.getOperationCount()).toBe(1);
      expect(row(r.receipt_id).status).toBe("CONFIRMED");
    });

    it("retries a stranded receipt only when reconcile proves nothing was written", async () => {
      const r = await gateway.enqueue(email());
      await strand(r.receipt_id!);
      await gateway.tickOutbox();
      expect(adapter.getOperationCount()).toBe(1);
      expect(row(r.receipt_id).status).toBe("CONFIRMED");
    });

    it("escalates a stranded receipt as UNCERTAIN when the external state cannot be read", async () => {
      const r = await gateway.enqueue(email());
      await strand(r.receipt_id!);
      adapter.setFaultConfig({ reconcileFails: true });
      const execute = vi.spyOn(adapter, "execute");
      await gateway.tickOutbox();
      expect(execute).not.toHaveBeenCalled();
      expect(row(r.receipt_id).status).toBe("UNCERTAIN");
    });

    it("confirms through reconcile when the adapter crashes after writing in the same worker", async () => {
      const r = await gateway.enqueue(email());
      adapter.setFaultConfig({ crashAfterWrite: true });
      await gateway.tickOutbox();
      expect(row(r.receipt_id).status).toBe("CONFIRMED");
      expect(adapter.getOperationCount()).toBe(1);
    });
  });
});
