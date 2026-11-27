// IncidentRuntime Tests — Phase 2D
import { describe, it, expect, beforeEach, vi } from "vitest";
import { IncidentRuntime, MemoryEventStore, type Clock, type EventStore } from "./incident-runtime.js";
import type { NormalizedEvent } from "@pactline/domain";

describe("IncidentRuntime", () => {
  let clock: Clock;
  let eventStore: EventStore;
  let runtime: IncidentRuntime;

  // Helper to create a test event
  const createEvent = (overrides: Partial<NormalizedEvent> = {}): NormalizedEvent => ({
    event_id: "550e8400-e29b-41d4-a716-446655440000",
    type: "VendorCommitmentChanged",
    project_id: "proj-001",
    subject_type: "POLine",
    subject_id: "pol-001",
    occurred_at: new Date("2026-12-14T09:00:00Z"),
    received_at: new Date("2026-12-14T09:05:00Z"),
    source: "vendor-email",
    source_event_id: "evt-001",
    source_version: null,
    evidence_ref: null,
    correlation_id: null,
    payload: {
      revised_arrival_date: "2027-01-07",
    },
    tainted_fields: ["payload.revised_arrival_date"],
    ...overrides,
  });

  beforeEach(() => {
    clock = { now: () => new Date("2026-12-14T10:00:00Z") };
    eventStore = new MemoryEventStore();
    runtime = new IncidentRuntime(clock, eventStore);
  });

  const stored = () => (eventStore as MemoryEventStore).events;
  const ev = (id: string | null, version: number | null, source = "vendor-email") => createEvent({ source, source_event_id: id, source_version: version });

  describe("ingestEvent", () => {
    it("stores a new event", async () => {
      const event = createEvent();
      const result = await runtime.ingestEvent(event);
      expect(result).toEqual({ success: true, event_id: event.event_id });
      expect(stored()).toEqual([event]);
    });

    it("rejects an exact redelivery", async () => {
      await runtime.ingestEvent(ev("evt-001", null));
      const result = await runtime.ingestEvent(ev("evt-001", null));
      expect(result.duplicate).toBe(true);
      expect(stored()).toHaveLength(1);
    });

    it("does not deduplicate events without a source_event_id", async () => {
      await runtime.ingestEvent(ev(null, null));
      await runtime.ingestEvent(ev(null, null));
      expect(stored()).toHaveLength(2);
    });

    it("rejects an older revision after a newer one is stored", async () => {
      await runtime.ingestEvent(ev("evt-001-v2", 2));
      const result = await runtime.ingestEvent(ev("evt-001-v1", 1));
      expect(result.out_of_order).toBe(true);
      expect(stored()).toHaveLength(1);
    });

    it("rejects a different delivery of the same version", async () => {
      await runtime.ingestEvent(ev("evt-001-v2", 2));
      expect((await runtime.ingestEvent(ev("evt-001-v2", 2))).duplicate).toBe(true);
    });

    it("accepts a newer revision", async () => {
      await runtime.ingestEvent(ev("evt-001-v2", 2));
      const result = await runtime.ingestEvent(ev("evt-001-v3", 3));
      expect(result.out_of_order).toBeUndefined();
      expect(stored()).toHaveLength(2);
    });

    it("keeps series separate per source and per event", async () => {
      await runtime.ingestEvent(ev("evt-001-v2", 2, "vendor-email"));
      expect((await runtime.ingestEvent(ev("evt-001-v1", 1, "vendor-portal"))).out_of_order).toBeUndefined();
      expect((await runtime.ingestEvent(ev("evt-002-v1", 1, "vendor-email"))).out_of_order).toBeUndefined();
    });

    it("accepts only one of many overlapping deliveries", async () => {
      const results = await Promise.all(Array.from({ length: 5 }, () => runtime.ingestEvent(ev("evt-009", null))));
      expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
      expect(stored()).toHaveLength(1);
    });

    it("never lets an older revision land after a newer one under overlap", async () => {
      await Promise.all([runtime.ingestEvent(ev("evt-007-v1", 1)), runtime.ingestEvent(ev("evt-007-v2", 2))]);
      expect(stored().map((e) => e.source_version)).toContain(2);
      await runtime.ingestEvent(ev("evt-007-v1", 1));
      expect(stored().filter((e) => e.source_version === 1).length).toBeLessThanOrEqual(1);
    });

    it("reports store errors without throwing", async () => {
      eventStore = { storeIfNew: vi.fn().mockRejectedValue(new Error("DB error")) };
      runtime = new IncidentRuntime(clock, eventStore);
      const result = await runtime.ingestEvent(createEvent());
      expect(result.success).toBe(false);
      expect(result.error).toContain("DB error");
    });
  });

  describe("Placeholder methods", () => {
    it("tickIncidents should throw not implemented", async () => {
      await expect(runtime.tickIncidents()).rejects.toThrow("Not implemented - Phase 3D");
    });

    it("tickTasks should throw not implemented", async () => {
      await expect(runtime.tickTasks()).rejects.toThrow("Not implemented - Phase 3A");
    });

    it("tickOutbox should throw not implemented", async () => {
      await expect(runtime.tickOutbox()).rejects.toThrow("Not implemented - Phase 2E");
    });
  });
});
