import { describe, expect, it, vi } from "vitest";
import type { IncidentId, SpecialistResult, StatePin, TaskId } from "@pactline/domain";
import { ExecutionGateway, MemoryGatewayStore, SandboxExternalAdapter, type ActionReceipt, type ExternalAdapter, type FaultConfig } from "@pactline/execution-gateway";
import { IncidentRuntime, MemoryEventStore, VirtualClock, type SchedulerPolicy } from "./incident-runtime.js";
import { MemoryAuditLog, MemoryIncidentQueue, MemoryReceiptReader, MemoryTaskQueue } from "./memory-stores.js";
import type { Decider, IncidentRecord, Outbox, ProposedAction, SpecialistRunner, TaskRecord } from "./ports.js";

const T0 = "2026-12-14T09:00:00Z";
const HOUR = 3_600_000;
const LEASE_MS = 60_000;
const VENDOR = "expedite@vendor.example";
const INC = "inc-0001" as IncidentId;

const incident = (over: Partial<IncidentRecord> = {}): IncidentRecord => ({
  id: INC,
  status: "EXECUTING",
  owner: "operator",
  next_action: "Monitor vendor commitment",
  blocker: null,
  next_review_at: new Date(T0),
  accepted_qty: 0,
  required_qty: 2,
  has_valid_waiver: false,
  has_schedule_disposition: false,
  has_valid_approval: false,
  approval_expired: false,
  follow_ups: 0,
  failures: 0,
  ...over,
});

const task = (over: Partial<TaskRecord> = {}): TaskRecord => ({
  id: "task-1" as TaskId,
  incident_id: INC,
  specialist: "INVESTIGATION",
  input: { po_line: "pol-pump-001" },
  pin: { config_rev: "cfg-1" },
  status: "QUEUED",
  attempts: 0,
  available_at: new Date(T0),
  result: null,
  error: null,
  ...over,
});

const answer = (pin: StatePin, status = "OK") => ({ status, input_versions: pin }) as unknown as SpecialistResult;

const followUp: ProposedAction = {
  action_type: "send_vendor_email",
  actor: "operator",
  reason: "No response on revised ship date",
  arguments: { po_line: "pol-pump-001" },
  recipient: VENDOR,
  template_id: "supplier-follow-up-v1",
};

const chase: Decider = async (_i, now) => ({ kind: "FOLLOW_UP", action: followUp, next_review_at: new Date(now.getTime() + 48 * HOUR) });

/** One world (incidents, tasks, receipts, the external system) shared by any number of workers. */
function world(opts: { decide?: Decider; runTask?: SpecialistRunner; policy?: Partial<SchedulerPolicy>; faults?: FaultConfig; currentPin?: (t: TaskRecord) => StatePin } = {}) {
  const clock = new VirtualClock(T0);
  const gatewayStore = new MemoryGatewayStore(() => clock.now());
  const sandbox = new SandboxExternalAdapter(opts.faults);
  const incidents = new MemoryIncidentQueue();
  const tasks = new MemoryTaskQueue(opts.currentPin);
  const audit = new MemoryAuditLog();
  const gateway = (adapter: ExternalAdapter = sandbox): Outbox =>
    new ExecutionGateway({ store: gatewayStore, adapter, clock: () => clock.now(), policy: { allowedRecipients: [VENDOR], leaseDurationSeconds: LEASE_MS / 1000 } });
  const worker = (workerId: string, outbox: Outbox = gateway(), decide: Decider = opts.decide ?? chase) =>
    new IncidentRuntime(clock, new MemoryEventStore(), {
      workerId,
      incidents,
      tasks,
      outbox,
      receipts: new MemoryReceiptReader(gatewayStore),
      audit,
      decide,
      runTask: opts.runTask ?? (async (t) => answer(t.pin)),
      policy: { leaseMs: LEASE_MS, ...opts.policy },
    });
  const receipts = () => [...gatewayStore.receipts.values()];
  return { clock, sandbox, incidents, tasks, audit, gateway, worker, receipts };
}

/** Performs the external write, then never returns: the process died before it could record CONFIRMED. */
const dyingAfterWrite = (inner: ExternalAdapter): ExternalAdapter => ({
  execute: async (r: ActionReceipt) => {
    await inner.execute(r);
    return new Promise(() => {});
  },
  reconcile: (key) => inner.reconcile(key),
});

describe("tickOutbox crash recovery", () => {
  it("reconciles a write stranded by a crash and never sends it twice", async () => {
    const w = world();
    w.incidents.put(incident());
    const w1 = w.worker("w1", w.gateway(dyingAfterWrite(w.sandbox)));
    await w1.tickIncidents();
    void w1.tickOutbox();
    await vi.waitFor(() => expect(w.sandbox.getOperationCount()).toBe(1));
    expect(w.receipts()[0]?.status).toBe("DISPATCHING");

    const w2 = w.worker("w2");
    await w2.tickOutbox();
    expect(w.receipts()[0]?.status).toBe("DISPATCHING");

    w.clock.advance(LEASE_MS + 1);
    await w2.tickOutbox();
    const [receipt] = w.receipts();
    expect(receipt?.status).toBe("CONFIRMED");
    expect(receipt?.external_id).toBe(w.sandbox.getOperation(receipt!.idempotency_key)?.external_id);
    expect(w.sandbox.getOperationCount()).toBe(1);
  });

  it("marks a write UNCERTAIN when external state cannot be verified, then escalates the incident", async () => {
    const decide = vi.fn(chase);
    const w = world({ decide, faults: { uncertain: true, reconcileFails: true } });
    w.incidents.put(incident());
    const rt = w.worker("w1");
    await rt.tickIncidents();
    await rt.tickOutbox();
    expect(w.receipts()[0]?.status).toBe("UNCERTAIN");

    w.clock.advance(48 * HOUR);
    await rt.tickOutbox();
    await rt.tickIncidents();
    expect(w.incidents.get(INC)).toMatchObject({ status: "ESCALATED", owner: "PROCUREMENT_MANAGER", blocker: expect.stringContaining("UNCERTAIN") });
    expect(decide).toHaveBeenCalledTimes(1);
    expect(w.sandbox.getOperationCount()).toBe(0);
  });
});

/** An outbox for a process that dies during enqueue: `after` decides whether the receipt was written first. */
const dyingOnEnqueue = (inner: Outbox, after: boolean): Outbox => ({
  authorize: (p) => inner.authorize(p),
  enqueue: async (p) => {
    if (after) await inner.enqueue(p);
    return new Promise(() => {});
  },
  tickOutbox: (n) => inner.tickOutbox(n),
});

describe("action handoff outbox", () => {
  it.each([
    ["before enqueue", false],
    ["after enqueue, before the handoff stamp", true],
  ])("recovers actions committed by a worker that crashed %s, writing once", async (_when, receiptWritten) => {
    const w = world();
    w.incidents.put(incident());
    void w.worker("w1", dyingOnEnqueue(w.gateway(), receiptWritten)).tickIncidents();
    await vi.waitFor(() => expect(w.incidents.get(INC)?.follow_ups).toBe(1));
    expect(w.receipts()).toHaveLength(receiptWritten ? 1 : 0);
    expect(await w.incidents.pendingActions(10)).toHaveLength(1);

    const w2 = w.worker("w2");
    expect(await w2.tickIncidents()).toBe(0);
    await w2.tickOutbox();
    expect(w.receipts().map((r) => [r.action_id, r.status])).toEqual([[`${INC}:follow-up:1`, "CONFIRMED"]]);
    expect(w.sandbox.getOperationCount()).toBe(1);
    expect(await w.incidents.pendingActions(10)).toHaveLength(0);
  });

  it("keeps one receipt when the same actions are drained twice", async () => {
    const w = world();
    w.incidents.put(incident());
    void w.worker("w1", dyingOnEnqueue(w.gateway(), false)).tickIncidents();
    await vi.waitFor(() => expect(w.incidents.get(INC)?.follow_ups).toBe(1));

    const [action] = await w.incidents.pendingActions(10);
    await Promise.all([w.worker("w2").tickIncidents(), w.worker("w3").tickIncidents()]);
    await w.gateway().enqueue(action!);
    await w.worker("w2").tickOutbox();
    await w.worker("w2").tickIncidents();
    expect(w.receipts()).toHaveLength(1);
    expect(w.sandbox.getOperationCount()).toBe(1);
    expect(w.audit.entries).toEqual([]);
  });

  it("records nothing for handoff when the commit loses its lease", async () => {
    const q = new MemoryIncidentQueue();
    q.put(incident());
    const [lease] = await q.claimDue("w1", new Date(T0), LEASE_MS, 1);
    q.put(incident({ next_action: "Human edit" }));
    const action = { ...followUp, action_id: `${INC}:follow-up:1`, incident_id: INC };
    expect(await q.commit(lease!, new Date(T0), incident({ follow_ups: 1 }), [action])).toBe("LEASE_LOST");
    expect(await q.pendingActions(10)).toEqual([]);
  });
});

describe("leases", () => {
  it("lets another worker reclaim an expired lease and rejects the stale worker's commit", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = vi.fn<Decider>(async (i, now) => (await gate, chase(i, now)));
    const w = world();
    w.incidents.put(incident());

    const stale = w.worker("w1", w.gateway(), slow).tickIncidents();
    await vi.waitFor(() => expect(slow).toHaveBeenCalled());
    w.clock.advance(LEASE_MS + 1);
    await w.worker("w2", w.gateway(), async (_i, now) => ({ kind: "HOLD", next_review_at: new Date(now.getTime() + HOUR), next_action: "Wait for vendor ASN" })).tickIncidents();

    release();
    await stale;
    expect(w.incidents.get(INC)).toMatchObject({ next_action: "Wait for vendor ASN", follow_ups: 0 });
    expect(w.receipts()).toHaveLength(0);
    expect(w.audit.entries).toEqual([expect.objectContaining({ worker: "w1", kind: "STALE_COMMIT", subject_id: INC })]);
  });

  it("rejects a commit when the row changed under the lease", async () => {
    const q = new MemoryIncidentQueue();
    q.put(incident());
    const [lease] = await q.claimDue("w1", new Date(T0), LEASE_MS, 1);
    q.put(incident({ next_action: "Human edit" }));
    expect(await q.commit(lease!, new Date(T0), incident({ next_action: "Worker decision" }), [])).toBe("LEASE_LOST");
    expect(q.get(INC)?.next_action).toBe("Human edit");
  });

  it("never gives one incident to two concurrent workers", async () => {
    const seen: string[] = [];
    const w = world({ decide: async (i, now) => (seen.push(i.id), { kind: "HOLD", next_review_at: new Date(now.getTime() + HOUR) }) });
    const ids = ["a", "b", "c", "d", "e"].map((s) => `inc-${s}` as IncidentId);
    ids.forEach((id) => w.incidents.put(incident({ id })));

    const claimed = await Promise.all([w.worker("w1").tickIncidents(), w.worker("w2").tickIncidents(), w.worker("w3").tickIncidents()]);
    expect(claimed.reduce((a, b) => a + b, 0)).toBe(5);
    expect([...seen].sort()).toEqual(ids);

    const q = new MemoryIncidentQueue();
    ids.forEach((id) => q.put(incident({ id })));
    const [x, y] = await Promise.all([q.claimDue("x", new Date(T0), LEASE_MS, 3), q.claimDue("y", new Date(T0), LEASE_MS, 3)]);
    const taken = [...x!, ...y!].map((l) => l.row.id);
    expect(new Set(taken).size).toBe(taken.length);
    expect(taken).toHaveLength(5);
  });
});

describe("bounded retries", () => {
  it("retries a failing review after a delay, then escalates", async () => {
    const w = world({ decide: async () => Promise.reject(new Error("model timeout")), policy: { maxReviewFailures: 3, retryDelayMs: 5 * 60_000 } });
    w.incidents.put(incident());
    const rt = w.worker("w1");
    for (let i = 0; i < 3; i++) {
      await rt.tickIncidents();
      w.clock.advance(5 * 60_000);
    }
    expect(w.incidents.get(INC)).toMatchObject({ status: "ESCALATED", owner: "PROCUREMENT_MANAGER", failures: 0, blocker: expect.stringContaining("model timeout") });
    expect(w.audit.entries.map((e) => e.kind)).toEqual(["DECISION_REJECTED", "DECISION_REJECTED", "ESCALATED"]);
  });

  it("treats a decision the state machine rejects as a failed review", async () => {
    const w = world({ decide: async () => ({ kind: "TRANSITION", request: { to: "CLOSED", actor: "operator", reason: "vendor says shipped" } }) });
    w.incidents.put(incident({ status: "VERIFYING" }));
    await w.worker("w1").tickIncidents();
    expect(w.incidents.get(INC)).toMatchObject({ status: "VERIFYING", failures: 1 });
    expect(w.audit.entries[0]?.detail).toContain("accepted_qty");
  });

  it("fails an outbox action after its retry budget and escalates the incident", async () => {
    const w = world({ faults: { uncertain: true } });
    w.incidents.put(incident());
    const rt = w.worker("w1");
    await rt.tickIncidents();
    for (let i = 0; i < 5; i++) {
      await rt.tickOutbox();
      w.clock.advance(LEASE_MS + 1);
    }
    expect(w.receipts()[0]).toMatchObject({ status: "FAILED", error: "Max retries exceeded" });
    w.clock.advance(48 * HOUR);
    await rt.tickIncidents();
    expect(w.incidents.get(INC)).toMatchObject({ status: "ESCALATED", blocker: expect.stringContaining("FAILED") });
  });

  it("re-queues a failing task, then fails it once attempts are spent", async () => {
    const runTask = vi.fn<SpecialistRunner>(async () => Promise.reject(new Error("rate limited")));
    const w = world({ runTask, policy: { maxTaskAttempts: 2, retryDelayMs: 1000 } });
    w.tasks.put(task());
    const rt = w.worker("w1");
    await rt.tickTasks();
    expect(w.tasks.get("task-1")).toMatchObject({ status: "QUEUED", attempts: 1 });
    expect(await rt.tickTasks()).toBe(0);
    w.clock.advance(1000);
    await rt.tickTasks();
    expect(w.tasks.get("task-1")).toMatchObject({ status: "FAILED", attempts: 2 });
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it("fails a task whose workers keep dying instead of running it again", async () => {
    const runTask = vi.fn<SpecialistRunner>(async (t) => answer(t.pin));
    const w = world({ runTask, policy: { maxTaskAttempts: 2 } });
    w.tasks.put(task({ status: "RUNNING", attempts: 2 }));
    await w.worker("w1").tickTasks();
    expect(w.tasks.get("task-1")?.status).toBe("FAILED");
    expect(runTask).not.toHaveBeenCalled();
  });
});

describe("tickTasks version pins", () => {
  it("completes a task whose pin is still current", async () => {
    const w = world();
    w.tasks.put(task());
    await w.worker("w1").tickTasks();
    expect(w.tasks.get("task-1")).toMatchObject({ status: "COMPLETED", result: answer({ config_rev: "cfg-1" }) });
  });

  it("keeps a result computed against drifted revisions for audit only", async () => {
    const w = world({ currentPin: () => ({ config_rev: "cfg-2" }) });
    w.tasks.put(task());
    await w.worker("w1").tickTasks();
    expect(w.tasks.get("task-1")?.status).toBe("STALE");
    expect(w.audit.entries.map((e) => e.kind)).toEqual(["STALE_TASK_RESULT"]);
  });

  it("marks STALE a result the specialist answered against other revisions", async () => {
    const w = world({ runTask: async () => answer({ config_rev: "cfg-0" }) });
    w.tasks.put(task());
    await w.worker("w1").tickTasks();
    expect(w.tasks.get("task-1")?.status).toBe("STALE");
  });

  it("discards a result whose lease expired while the specialist ran", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const runTask = vi.fn<SpecialistRunner>(async (t) => (await gate, answer(t.pin)));
    const w = world({ runTask });
    w.tasks.put(task());
    const stale = w.worker("w1").tickTasks();
    await vi.waitFor(() => expect(runTask).toHaveBeenCalled());
    w.clock.advance(LEASE_MS + 1);
    release();
    await stale;
    expect(w.tasks.get("task-1")?.status).toBe("RUNNING");
    expect(w.audit.entries).toEqual([expect.objectContaining({ kind: "STALE_COMMIT", subject_id: "task-1" })]);
  });
});

describe("supplier silence timer", () => {
  it("sends a bounded number of follow-ups on the review timer, then escalates", async () => {
    const w = world({ policy: { maxFollowUps: 2 } });
    w.incidents.put(incident());
    const rt = w.worker("w1");
    const tick = async () => (await rt.tickIncidents(), await rt.tickOutbox());

    await tick();
    expect(w.sandbox.getOperationCount()).toBe(1);
    w.clock.advance(HOUR);
    expect(await rt.tickIncidents()).toBe(0);

    w.clock.advance(47 * HOUR);
    await tick();
    expect(w.sandbox.getOperationCount()).toBe(2);

    w.clock.advance(48 * HOUR);
    await tick();
    expect(w.sandbox.getOperationCount()).toBe(2);
    expect(w.incidents.get(INC)).toMatchObject({ status: "ESCALATED", owner: "PROCUREMENT_MANAGER", blocker: "Supplier silent after 2 follow-ups" });
    expect(w.receipts().map((r) => [r.action_id, r.status])).toEqual([
      [`${INC}:follow-up:1`, "CONFIRMED"],
      [`${INC}:follow-up:2`, "CONFIRMED"],
    ]);
  });
});
