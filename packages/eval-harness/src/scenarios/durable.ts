// Scenarios 7 and 8: durable scheduler under crash and supplier silence, on a VirtualClock with the sandbox adapter.
import type { IncidentId } from "@pactline/domain";
import { ExecutionGateway, MemoryGatewayStore, SandboxExternalAdapter, type ExternalAdapter, type FaultConfig } from "@pactline/execution-gateway";
import {
  IncidentRuntime,
  MemoryAuditLog,
  MemoryEventStore,
  MemoryIncidentQueue,
  MemoryReceiptReader,
  MemoryTaskQueue,
  VirtualClock,
  type Decider,
  type IncidentRecord,
  type Outbox,
} from "@pactline/incident-runtime";
import { type RunnableScenario, check } from "../harness.js";

const HOUR = 3_600_000;
const LEASE_MS = 60_000;
const VENDOR = "expedite@vendor.sandbox";
const INC = "INC-0001" as IncidentId;

/** Sandbox fixture: pump package P-CHW-01A/B on PO line pol-pump-001, waiting on a revised ship date. */
const executing = (): IncidentRecord => ({
  id: INC,
  status: "EXECUTING",
  owner: "operator",
  next_action: "Monitor vendor commitment for pol-pump-001",
  blocker: null,
  next_review_at: new Date("2026-12-14T09:00:00Z"),
  accepted_qty: 0,
  required_qty: 2,
  has_valid_waiver: false,
  has_schedule_disposition: false,
  has_valid_approval: false,
  approval_expired: false,
  follow_ups: 0,
  failures: 0,
});

const chaseSupplier: Decider = async (_incident, now) => ({
  kind: "FOLLOW_UP",
  next_review_at: new Date(now.getTime() + 48 * HOUR),
  action: {
    action_type: "send_vendor_email",
    actor: "operator",
    reason: "No response on revised ship date for pol-pump-001",
    arguments: { po_line: "pol-pump-001" },
    recipient: VENDOR,
    template_id: "supplier-follow-up-v1",
  },
});

function world(faults: FaultConfig = {}, maxFollowUps = 3) {
  const clock = new VirtualClock("2026-12-14T09:00:00Z");
  const gatewayStore = new MemoryGatewayStore(() => clock.now());
  const sandbox = new SandboxExternalAdapter(faults);
  const incidents = new MemoryIncidentQueue();
  incidents.put(executing());
  const gateway = (adapter: ExternalAdapter): Outbox =>
    new ExecutionGateway({ store: gatewayStore, adapter, clock: () => clock.now(), policy: { allowedRecipients: [VENDOR], leaseDurationSeconds: LEASE_MS / 1000 } });
  const worker = (workerId: string, adapter: ExternalAdapter = sandbox) =>
    new IncidentRuntime(clock, new MemoryEventStore(), {
      workerId,
      incidents,
      tasks: new MemoryTaskQueue(),
      outbox: gateway(adapter),
      receipts: new MemoryReceiptReader(gatewayStore),
      audit: new MemoryAuditLog(),
      decide: chaseSupplier,
      runTask: async () => Promise.reject(new Error("no specialist tasks in this scenario")),
      policy: { leaseMs: LEASE_MS, maxFollowUps },
    });
  const receipts = () => [...gatewayStore.receipts.values()];
  return { clock, sandbox, incidents, worker, receipts };
}

export const crashAfterExternalWrite: RunnableScenario = {
  id: 7,
  title: "Process crash after external write (reconcile -> 0 duplicate writes)",
  run: async () => {
    const w = world();
    let written!: () => void;
    const wrote = new Promise<void>((resolve) => (written = resolve));
    // Worker 1 performs the write, then dies (kill -9) before recording CONFIRMED.
    const dying: ExternalAdapter = {
      execute: async (receipt) => {
        await w.sandbox.execute(receipt);
        written();
        return new Promise(() => {});
      },
      reconcile: (key) => w.sandbox.reconcile(key),
    };
    const w1 = w.worker("worker-pid-1", dying);
    await w1.tickIncidents();
    void w1.tickOutbox();
    await wrote;
    const stranded = w.receipts()[0]?.status;

    const w2 = w.worker("worker-pid-2");
    await w2.tickOutbox();
    const whileLeased = w.receipts()[0]?.status;
    w.clock.advance(LEASE_MS + 1);
    await w2.tickOutbox();
    const receipt = w.receipts()[0];

    // Control: the external system cannot be queried, so the write must be escalated, not retried.
    const c = world({ uncertain: true, reconcileFails: true });
    const cw = c.worker("worker-pid-1");
    await cw.tickIncidents();
    await cw.tickOutbox();
    c.clock.advance(48 * HOUR);
    await cw.tickIncidents();

    return [
      check("the external write happened before the crash", w.sandbox.getOperationCount(), 1),
      check("the crashed dispatch is left DISPATCHING", stranded, "DISPATCHING"),
      check("a restarted worker does not touch a receipt under a live lease", whileLeased, "DISPATCHING"),
      check("after lease expiry, reconcile confirms the receipt", receipt?.status, "CONFIRMED"),
      check("the receipt records the external id found by reconcile", receipt?.external_id, w.sandbox.getOperation(receipt?.idempotency_key ?? "")?.external_id),
      check("duplicate external writes", w.sandbox.getOperationCount() - 1, 0),
      check("control: unverifiable write is UNCERTAIN", c.receipts()[0]?.status, "UNCERTAIN"),
      check("control: incident escalates on an UNCERTAIN write", c.incidents.get(INC)?.status, "ESCALATED"),
      check("control: no blind retry", c.sandbox.getOperationCount(), 0),
    ];
  },
};

export const supplierSilenceEscalation: RunnableScenario = {
  id: 8,
  title: "Supplier silence timeout -> bounded follow-up -> escalation",
  run: async () => {
    const w = world({}, 2);
    const rt = w.worker("worker-pid-1");
    const tick = async () => {
      const reviewed = await rt.tickIncidents();
      await rt.tickOutbox();
      return reviewed;
    };

    await tick();
    const afterFirst = w.sandbox.getOperationCount();
    w.clock.advance(HOUR);
    const earlyReview = await tick();
    w.clock.advance(47 * HOUR);
    await tick();
    const afterSecond = w.sandbox.getOperationCount();
    w.clock.advance(48 * HOUR);
    await tick();
    const incident = w.incidents.get(INC);

    return [
      check("first review sends follow-up 1", afterFirst, 1),
      check("no review before the 48 h timer is due", earlyReview, 0),
      check("second timer sends follow-up 2", afterSecond, 2),
      check("follow-ups stop at the bound", w.sandbox.getOperationCount(), 2),
      check("third silent review escalates", incident?.status, "ESCALATED"),
      check("escalation hands the incident to a human owner", incident?.owner, "PROCUREMENT_MANAGER"),
      check("escalation states the blocker", incident?.blocker, "Supplier silent after 2 follow-ups"),
      check("escalated incident keeps a review timer (invariant 8)", incident?.next_review_at?.toISOString(), "2026-12-18T13:00:00.000Z"),
      check("each follow-up has its own idempotent action", w.receipts().map((r) => r.action_id), [`${INC}:follow-up:1`, `${INC}:follow-up:2`]),
    ];
  },
};
