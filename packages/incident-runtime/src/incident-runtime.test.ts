// IncidentRuntime Tests — Phase 2D
import { describe, it, expect, beforeEach, vi } from "vitest";
import { IncidentRuntime, type Clock, type EventStore } from "./incident-runtime.js";
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
    clock = {
      now: () => new Date("2026-12-14T10:00:00Z"),
    };

    eventStore = {
      isDuplicate: vi.fn().mockResolvedValue(false),
      getExistingVersion: vi.fn().mockResolvedValue(null),
      store: vi.fn().mockResolvedValue(undefined),
    };

    runtime = new IncidentRuntime(clock, eventStore);
  });

  describe("ingestEvent", () => {
    it("should successfully ingest a new event", async () => {
      const event = createEvent();

      const result = await runtime.ingestEvent(event);

      expect(result.success).toBe(true);
      expect(result.event_id).toBe(event.event_id);
      expect(result.duplicate).toBeUndefined();
      expect(result.out_of_order).toBeUndefined();
      expect(eventStore.store).toHaveBeenCalledWith(event);
    });

    it("should check for duplicates using deduplication key", async () => {
      const event = createEvent({ source_event_id: "evt-001" });

      await runtime.ingestEvent(event);

      expect(eventStore.isDuplicate).toHaveBeenCalledWith("vendor-email:evt-001");
    });

    it("should reject duplicate events", async () => {
      const event = createEvent({ source_event_id: "evt-001" });
      vi.mocked(eventStore.isDuplicate).mockResolvedValue(true);

      const result = await runtime.ingestEvent(event);

      expect(result.success).toBe(true);
      expect(result.duplicate).toBe(true);
      expect(eventStore.store).not.toHaveBeenCalled();
    });

    it("should handle events without source_event_id (not deduplicatable)", async () => {
      const event = createEvent({ source_event_id: null });

      const result = await runtime.ingestEvent(event);

      expect(result.success).toBe(true);
      expect(eventStore.isDuplicate).not.toHaveBeenCalled();
      expect(eventStore.store).toHaveBeenCalledWith(event);
    });

    it("should check version for out-of-order detection", async () => {
      const event = createEvent({
        source_event_id: "evt-001-v2",
        source_version: 2,
      });

      await runtime.ingestEvent(event);

      expect(eventStore.getExistingVersion).toHaveBeenCalledWith("vendor-email:evt-001-v2");
    });

    it("should reject out-of-order event (lower version)", async () => {
      const event = createEvent({
        source_event_id: "evt-001-v1",
        source_version: 1,
      });
      vi.mocked(eventStore.getExistingVersion).mockResolvedValue(2);

      const result = await runtime.ingestEvent(event);

      expect(result.success).toBe(true);
      expect(result.out_of_order).toBe(true);
      expect(eventStore.store).not.toHaveBeenCalled();
    });

    it("should reject out-of-order event (same version)", async () => {
      const event = createEvent({
        source_event_id: "evt-001-v2",
        source_version: 2,
      });
      vi.mocked(eventStore.getExistingVersion).mockResolvedValue(2);

      const result = await runtime.ingestEvent(event);

      expect(result.success).toBe(true);
      expect(result.out_of_order).toBe(true);
      expect(eventStore.store).not.toHaveBeenCalled();
    });

    it("should accept in-order event (higher version)", async () => {
      const event = createEvent({
        source_event_id: "evt-001-v3",
        source_version: 3,
      });
      vi.mocked(eventStore.getExistingVersion).mockResolvedValue(2);

      const result = await runtime.ingestEvent(event);

      expect(result.success).toBe(true);
      expect(result.out_of_order).toBeUndefined();
      expect(eventStore.store).toHaveBeenCalledWith(event);
    });

    it("should handle events without version", async () => {
      const event = createEvent({
        source_event_id: "evt-001",
        source_version: null,
      });

      const result = await runtime.ingestEvent(event);

      expect(result.success).toBe(true);
      expect(eventStore.getExistingVersion).not.toHaveBeenCalled();
      expect(eventStore.store).toHaveBeenCalledWith(event);
    });

    it("should handle store errors gracefully", async () => {
      const event = createEvent();
      vi.mocked(eventStore.store).mockRejectedValue(new Error("DB error"));

      const result = await runtime.ingestEvent(event);

      expect(result.success).toBe(false);
      expect(result.error).toContain("DB error");
    });
  });

  describe("Deduplication key generation", () => {
    it("should handle different sources", async () => {
      const event1 = createEvent({ source: "vendor-email", source_event_id: "evt-001" });
      const event2 = createEvent({ source: "vendor-portal", source_event_id: "evt-001" });

      await runtime.ingestEvent(event1);
      await runtime.ingestEvent(event2);

      expect(eventStore.isDuplicate).toHaveBeenCalledWith("vendor-email:evt-001");
      expect(eventStore.isDuplicate).toHaveBeenCalledWith("vendor-portal:evt-001");
    });

    it("should treat same source+event_id as duplicate", async () => {
      const event = createEvent({ source: "vendor-email", source_event_id: "evt-001" });

      vi.mocked(eventStore.isDuplicate).mockResolvedValueOnce(false).mockResolvedValueOnce(true);

      const result1 = await runtime.ingestEvent(event);
      const result2 = await runtime.ingestEvent(event);

      expect(result1.success).toBe(true);
      expect(result1.duplicate).toBeUndefined();
      expect(result2.success).toBe(true);
      expect(result2.duplicate).toBe(true);
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
