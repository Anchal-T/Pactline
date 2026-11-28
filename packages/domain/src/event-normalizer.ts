// Event Normalization & Deduplication — Phase 2D
// Validates incoming events, deduplicates by (source, source_event_id),
// handles out-of-order events, and marks untrusted fields as tainted

import { z } from "zod";
import type { EventEnvelope } from "./events.js";
import { EventEnvelopeSchema } from "./events.js";

/**
 * Taint marking for untrusted fields from external sources
 */
export type TaintStatus = "untrusted" | "verified" | "derived";

/**
 * Normalized event ready for processing
 */
export interface NormalizedEvent {
  event_id: string;
  type: string;
  project_id: string;
  subject_type: string;
  subject_id: string;
  occurred_at: Date;
  received_at: Date;
  source: string;
  source_event_id: string | null;
  source_version: number | null;
  evidence_ref: string | null;
  correlation_id: string | null;
  payload: Record<string, unknown>;
  tainted_fields: string[];
}

/**
 * Result of event normalization
 */
export interface NormalizationResult {
  success: boolean;
  event?: NormalizedEvent;
  error?: string;
  duplicate?: boolean;
  out_of_order?: boolean;
}

/**
 * Configuration for untrusted field patterns by event type
 */
const UNTRUSTED_FIELD_PATTERNS: Record<string, string[]> = {
  VendorCommitmentChanged: [
    "payload.revised_arrival_date",
    "payload.reason",
    "payload.vendor_contact",
  ],
  SupplierResponseReceived: [
    "payload.message",
    "payload.quoted_price",
    "payload.quoted_lead_time",
    "payload.stock_status",
  ],
  OfferReceived: [
    "payload.price",
    "payload.lead_time",
    "payload.quoted_arrival_date",
    "payload.stock_status",
    "payload.technical_notes",
  ],
  SubmittalReceived: [
    "payload.manufacturer_name",
    "payload.model_number",
    "payload.technical_data",
  ],
};

export interface NormalizeOptions {
  /**
   * Sources the deployment itself vouches for, supplied by the caller from its own configuration (for example the
   * authenticated connector that received the event). The event's own `source` string is untrusted input and
   * is never enough: anything not listed here is treated as external and its fields are tainted.
   */
  trustedSources?: readonly string[];
}

/**
 * Event Normalizer
 *
 * Responsibilities:
 * - Validate event envelope schema
 * - Parse ISO datetime strings to Date objects
 * - Extract source_version from source_event_id if present (e.g., "evt-001-v2")
 * - Mark untrusted fields based on source and event type
 * - Prepare for deduplication check (caller must check DB)
 */
export class EventNormalizer {
  /**
   * Normalize an incoming event envelope
   */
  static normalize(raw: unknown, opts: NormalizeOptions = {}): NormalizationResult {
    // Validate schema
    const parseResult = EventEnvelopeSchema.safeParse(raw);
    if (!parseResult.success) {
      return {
        success: false,
        error: `Invalid event schema: ${parseResult.error.message}`,
      };
    }

    const envelope = parseResult.data;

    // Parse datetime strings
    let occurredAt: Date;
    let receivedAt: Date;

    try {
      occurredAt = new Date(envelope.occurred_at);
      receivedAt = new Date(envelope.received_at);

      if (isNaN(occurredAt.getTime()) || isNaN(receivedAt.getTime())) {
        return {
          success: false,
          error: "Invalid datetime format in occurred_at or received_at",
        };
      }
    } catch (err) {
      return {
        success: false,
        error: `Failed to parse datetime: ${err}`,
      };
    }

    // Extract source_version from source_event_id if present
    // Format: "evt-001-v2" → version 2
    let sourceVersion: number | null = null;
    if (envelope.source_event_id) {
      const versionMatch = envelope.source_event_id.match(/-v(\d+)$/);
      if (versionMatch && versionMatch[1]) {
        sourceVersion = parseInt(versionMatch[1], 10);
      }
    }

    // Identify tainted fields based on source and event type
    const taintedFields = this.identifyTaintedFields(envelope, opts.trustedSources ?? []);

    const normalized: NormalizedEvent = {
      event_id: envelope.event_id,
      type: envelope.type,
      project_id: envelope.project_id,
      subject_type: envelope.subject_type,
      subject_id: envelope.subject_id,
      occurred_at: occurredAt,
      received_at: receivedAt,
      source: envelope.source,
      source_event_id: envelope.source_event_id ?? null,
      source_version: sourceVersion,
      evidence_ref: envelope.evidence_ref ?? null,
      correlation_id: envelope.correlation_id ?? null,
      payload: envelope.payload,
      tainted_fields: taintedFields,
    };

    return {
      success: true,
      event: normalized,
    };
  }

  /**
   * Identify fields that should be marked as tainted (untrusted)
   * based on the event source and type
   */
  private static identifyTaintedFields(envelope: EventEnvelope, trustedSources: readonly string[]): string[] {
    // Default to untrusted: only a source the caller explicitly vouches for is exempt.
    if (trustedSources.includes(envelope.source)) return [];

    // Get untrusted field patterns for this event type
    const patterns = UNTRUSTED_FIELD_PATTERNS[envelope.type] || [];

    // Check which patterns exist in the envelope
    const taintedFields: string[] = [];
    for (const pattern of patterns) {
      if (this.fieldExists(envelope, pattern)) {
        taintedFields.push(pattern);
      }
    }

    return taintedFields;
  }

  /**
   * Check if a nested field exists in an object
   * Example: fieldExists(obj, "payload.revised_arrival_date")
   */
  private static fieldExists(obj: Record<string, unknown>, path: string): boolean {
    const parts = path.split(".");
    let current: any = obj;

    for (const part of parts) {
      if (current && typeof current === "object" && part in current) {
        current = current[part];
      } else {
        return false;
      }
    }

    return current !== undefined;
  }

  /**
   * Create a deduplication key from source and source_event_id
   * Returns null if source_event_id is not present (not deduplicatable)
   */
  static getDeduplicationKey(event: NormalizedEvent): string | null {
    if (!event.source_event_id) {
      return null;
    }
    return `${event.source}:${event.source_event_id}`;
  }

  /**
   * Identity shared by every revision of one source event: "evt-001-v1" and "evt-001-v2" are the same series.
   * Use it to compare versions; use getDeduplicationKey (full id) to detect exact redeliveries.
   */
  static getSeriesKey(event: NormalizedEvent): string | null {
    if (!event.source_event_id) {
      return null;
    }
    return `${event.source}:${event.source_event_id.replace(/-v\d+$/, "")}`;
  }

  /**
   * Determine if an incoming event is out-of-order based on versions
   * Returns true if incoming_version <= existing_version
   */
  static isOutOfOrder(
    incomingVersion: number | null,
    existingVersion: number | null
  ): boolean {
    // If either has no version, can't determine order
    if (incomingVersion === null || existingVersion === null) {
      return false;
    }

    return incomingVersion <= existingVersion;
  }

  /**
   * Validate that required payload fields are present for a given event type
   */
  static validatePayload(event: NormalizedEvent): string | null {
    const requiredFields: Record<string, string[]> = {
      VendorCommitmentChanged: ["revised_arrival_date"],
      ScheduleRevised: ["schedule_revision_id"],
      OfferReceived: ["supplier_id", "product_config_id"],
      ApprovalGranted: ["approval_id"],
      ApprovalRejected: ["approval_id", "reason"],
      ShipmentReceived: ["po_line_id", "quantity"],
    };

    const required = requiredFields[event.type];
    if (!required) {
      return null; // No specific requirements
    }

    for (const field of required) {
      if (!(field in event.payload)) {
        return `Missing required payload field: ${field}`;
      }
    }

    return null;
  }
}
