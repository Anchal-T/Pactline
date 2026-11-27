// Event Normalizer Tests — Phase 2D
import { describe, it, expect } from "vitest";
import { EventNormalizer } from "./event-normalizer.js";

describe("EventNormalizer", () => {
  describe("normalize", () => {
    it("should normalize a valid event envelope", () => {
      const raw = {
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        type: "VendorCommitmentChanged",
        project_id: "proj-001",
        subject_type: "POLine",
        subject_id: "pol-001",
        occurred_at: "2026-12-14T09:00:00Z",
        received_at: "2026-12-14T09:05:00Z",
        source: "sandbox-vendor-email",
        source_event_id: "evt-001",
        payload: {
          previous_arrival_date: "2026-12-28",
          revised_arrival_date: "2027-01-07",
          reason: "Manufacturing backlog",
        },
      };

      const result = EventNormalizer.normalize(raw);

      expect(result.success).toBe(true);
      expect(result.event).toBeDefined();
      expect(result.event?.event_id).toBe(raw.event_id);
      expect(result.event?.type).toBe("VendorCommitmentChanged");
      expect(result.event?.occurred_at).toBeInstanceOf(Date);
      expect(result.event?.received_at).toBeInstanceOf(Date);
    });

    it("should parse datetime strings to Date objects", () => {
      const raw = {
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        type: "VendorCommitmentChanged",
        project_id: "proj-001",
        subject_type: "POLine",
        subject_id: "pol-001",
        occurred_at: "2026-12-14T09:00:00Z",
        received_at: "2026-12-14T09:05:00Z",
        source: "internal",
        payload: {},
      };

      const result = EventNormalizer.normalize(raw);

      expect(result.success).toBe(true);
      expect(result.event?.occurred_at).toEqual(new Date("2026-12-14T09:00:00Z"));
      expect(result.event?.received_at).toEqual(new Date("2026-12-14T09:05:00Z"));
    });

    it("should extract source_version from versioned source_event_id", () => {
      const raw = {
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        type: "VendorCommitmentChanged",
        project_id: "proj-001",
        subject_type: "POLine",
        subject_id: "pol-001",
        occurred_at: "2026-12-14T09:00:00Z",
        received_at: "2026-12-14T09:05:00Z",
        source: "vendor-portal",
        source_event_id: "evt-001-v2",
        payload: {},
      };

      const result = EventNormalizer.normalize(raw);

      expect(result.success).toBe(true);
      expect(result.event?.source_version).toBe(2);
    });

    it("should handle source_event_id without version", () => {
      const raw = {
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        type: "VendorCommitmentChanged",
        project_id: "proj-001",
        subject_type: "POLine",
        subject_id: "pol-001",
        occurred_at: "2026-12-14T09:00:00Z",
        received_at: "2026-12-14T09:05:00Z",
        source: "vendor-portal",
        source_event_id: "evt-001",
        payload: {},
      };

      const result = EventNormalizer.normalize(raw);

      expect(result.success).toBe(true);
      expect(result.event?.source_version).toBeNull();
    });

    it("should handle missing optional fields", () => {
      const raw = {
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        type: "VendorCommitmentChanged",
        project_id: "proj-001",
        subject_type: "POLine",
        subject_id: "pol-001",
        occurred_at: "2026-12-14T09:00:00Z",
        received_at: "2026-12-14T09:05:00Z",
        source: "internal",
        payload: {},
      };

      const result = EventNormalizer.normalize(raw);

      expect(result.success).toBe(true);
      expect(result.event?.source_event_id).toBeNull();
      expect(result.event?.evidence_ref).toBeNull();
      expect(result.event?.correlation_id).toBeNull();
    });

    it("should reject event with invalid schema", () => {
      const raw = {
        event_id: "not-a-uuid",
        type: "VendorCommitmentChanged",
        // missing required fields
      };

      const result = EventNormalizer.normalize(raw);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid event schema");
    });

    it("should reject event with invalid datetime", () => {
      const raw = {
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        type: "VendorCommitmentChanged",
        project_id: "proj-001",
        subject_type: "POLine",
        subject_id: "pol-001",
        occurred_at: "not-a-date",
        received_at: "2026-12-14T09:05:00Z",
        source: "internal",
        payload: {},
      };

      const result = EventNormalizer.normalize(raw);

      expect(result.success).toBe(false);
      expect(result.error).toContain("datetime");
    });
  });

  describe("Taint marking", () => {
    it("should mark vendor-sourced fields as tainted", () => {
      const raw = {
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        type: "VendorCommitmentChanged",
        project_id: "proj-001",
        subject_type: "POLine",
        subject_id: "pol-001",
        occurred_at: "2026-12-14T09:00:00Z",
        received_at: "2026-12-14T09:05:00Z",
        source: "sandbox-vendor-email",
        payload: {
          revised_arrival_date: "2027-01-07",
          reason: "Manufacturing backlog",
          vendor_contact: "test@vendor.com",
        },
      };

      const result = EventNormalizer.normalize(raw);

      expect(result.success).toBe(true);
      expect(result.event?.tainted_fields).toContain("payload.revised_arrival_date");
      expect(result.event?.tainted_fields).toContain("payload.reason");
      expect(result.event?.tainted_fields).toContain("payload.vendor_contact");
    });

    it("should not mark internal source as tainted", () => {
      const raw = {
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        type: "VendorCommitmentChanged",
        project_id: "proj-001",
        subject_type: "POLine",
        subject_id: "pol-001",
        occurred_at: "2026-12-14T09:00:00Z",
        received_at: "2026-12-14T09:05:00Z",
        source: "internal-system",
        payload: {
          revised_arrival_date: "2027-01-07",
        },
      };

      const result = EventNormalizer.normalize(raw);

      expect(result.success).toBe(true);
      expect(result.event?.tainted_fields).toHaveLength(0);
    });

    it("should mark supplier response fields as tainted", () => {
      const raw = {
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        type: "SupplierResponseReceived",
        project_id: "proj-001",
        subject_type: "RFQ",
        subject_id: "rfq-001",
        occurred_at: "2026-12-14T09:00:00Z",
        received_at: "2026-12-14T09:05:00Z",
        source: "supplier-system",
        payload: {
          message: "Stock available",
          quoted_price: 15000,
          quoted_lead_time: "2 weeks",
          stock_status: "available",
        },
      };

      const result = EventNormalizer.normalize(raw);

      expect(result.success).toBe(true);
      expect(result.event?.tainted_fields).toContain("payload.message");
      expect(result.event?.tainted_fields).toContain("payload.quoted_price");
      expect(result.event?.tainted_fields).toContain("payload.quoted_lead_time");
      expect(result.event?.tainted_fields).toContain("payload.stock_status");
    });

    it("should only mark fields that actually exist", () => {
      const raw = {
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        type: "VendorCommitmentChanged",
        project_id: "proj-001",
        subject_type: "POLine",
        subject_id: "pol-001",
        occurred_at: "2026-12-14T09:00:00Z",
        received_at: "2026-12-14T09:05:00Z",
        source: "vendor-email",
        payload: {
          revised_arrival_date: "2027-01-07",
          // reason and vendor_contact missing
        },
      };

      const result = EventNormalizer.normalize(raw);

      expect(result.success).toBe(true);
      expect(result.event?.tainted_fields).toContain("payload.revised_arrival_date");
      expect(result.event?.tainted_fields).not.toContain("payload.reason");
      expect(result.event?.tainted_fields).not.toContain("payload.vendor_contact");
    });
  });

  describe("Deduplication", () => {
    it("should generate deduplication key from source and source_event_id", () => {
      const event = {
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        type: "VendorCommitmentChanged",
        project_id: "proj-001",
        subject_type: "POLine",
        subject_id: "pol-001",
        occurred_at: new Date(),
        received_at: new Date(),
        source: "vendor-email",
        source_event_id: "evt-001",
        source_version: null,
        evidence_ref: null,
        correlation_id: null,
        payload: {},
        tainted_fields: [],
      };

      const key = EventNormalizer.getDeduplicationKey(event);

      expect(key).toBe("vendor-email:evt-001");
    });

    it("should return null for events without source_event_id", () => {
      const event = {
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        type: "VendorCommitmentChanged",
        project_id: "proj-001",
        subject_type: "POLine",
        subject_id: "pol-001",
        occurred_at: new Date(),
        received_at: new Date(),
        source: "vendor-email",
        source_event_id: null,
        source_version: null,
        evidence_ref: null,
        correlation_id: null,
        payload: {},
        tainted_fields: [],
      };

      const key = EventNormalizer.getDeduplicationKey(event);

      expect(key).toBeNull();
    });
  });

  describe("Out-of-order handling", () => {
    it("should detect out-of-order event (lower version)", () => {
      const isOOO = EventNormalizer.isOutOfOrder(1, 2);
      expect(isOOO).toBe(true);
    });

    it("should detect out-of-order event (same version)", () => {
      const isOOO = EventNormalizer.isOutOfOrder(2, 2);
      expect(isOOO).toBe(true);
    });

    it("should allow in-order event (higher version)", () => {
      const isOOO = EventNormalizer.isOutOfOrder(3, 2);
      expect(isOOO).toBe(false);
    });

    it("should handle missing versions gracefully", () => {
      expect(EventNormalizer.isOutOfOrder(null, 2)).toBe(false);
      expect(EventNormalizer.isOutOfOrder(2, null)).toBe(false);
      expect(EventNormalizer.isOutOfOrder(null, null)).toBe(false);
    });
  });

  describe("Payload validation", () => {
    it("should validate VendorCommitmentChanged payload", () => {
      const event = {
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        type: "VendorCommitmentChanged",
        project_id: "proj-001",
        subject_type: "POLine",
        subject_id: "pol-001",
        occurred_at: new Date(),
        received_at: new Date(),
        source: "vendor-email",
        source_event_id: "evt-001",
        source_version: null,
        evidence_ref: null,
        correlation_id: null,
        payload: {
          revised_arrival_date: "2027-01-07",
        },
        tainted_fields: [],
      };

      const error = EventNormalizer.validatePayload(event);
      expect(error).toBeNull();
    });

    it("should reject VendorCommitmentChanged without required field", () => {
      const event = {
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        type: "VendorCommitmentChanged",
        project_id: "proj-001",
        subject_type: "POLine",
        subject_id: "pol-001",
        occurred_at: new Date(),
        received_at: new Date(),
        source: "vendor-email",
        source_event_id: "evt-001",
        source_version: null,
        evidence_ref: null,
        correlation_id: null,
        payload: {
          // missing revised_arrival_date
        },
        tainted_fields: [],
      };

      const error = EventNormalizer.validatePayload(event);
      expect(error).toContain("revised_arrival_date");
    });

    it("should allow events with no specific payload requirements", () => {
      const event = {
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        type: "MilestoneMissed",
        project_id: "proj-001",
        subject_type: "Activity",
        subject_id: "act-001",
        occurred_at: new Date(),
        received_at: new Date(),
        source: "schedule-monitor",
        source_event_id: "evt-001",
        source_version: null,
        evidence_ref: null,
        correlation_id: null,
        payload: {},
        tainted_fields: [],
      };

      const error = EventNormalizer.validatePayload(event);
      expect(error).toBeNull();
    });
  });
});
