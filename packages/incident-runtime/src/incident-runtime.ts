// IncidentRuntime — Phase 2D (ingestEvent)
// Four stateless ticks driven by injected Clock per AGENTS.md §4

import { EventNormalizer, type NormalizedEvent } from "@pactline/domain";

/**
 * Clock interface for time control
 * Real implementation in production, VirtualClock in tests
 */
export interface Clock {
  now(): Date;
}

/**
 * Real-time clock implementation
 */
export class RealClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export type StoreOutcome = "stored" | "duplicate" | "out_of_order";

export interface EventKeys {
  /** Full source id, for exact redeliveries: "vendor-email:evt-001-v2". Null when the source gave no id. */
  dedupeKey: string | null;
  /** Shared by every revision of one source event: "vendor-email:evt-001". Null when the source gave no id. */
  seriesKey: string | null;
}

/**
 * Event storage interface. Actual implementation in @pactline/db.
 *
 * The duplicate check, the version comparison and the write are one operation: two overlapping deliveries must
 * not both be accepted, and an older revision must not land after a newer one. A database implementation does
 * this in one transaction (a unique index on dedupeKey plus a lock on the series), not as separate calls.
 */
export interface EventStore {
  storeIfNew(event: NormalizedEvent, keys: EventKeys): Promise<StoreOutcome>;
}

/** In-process store. Atomic because nothing awaits between the check and the write. For tests and local runs. */
export class MemoryEventStore implements EventStore {
  readonly events: NormalizedEvent[] = [];
  private readonly seen = new Set<string>();
  private readonly latestVersion = new Map<string, number>();

  async storeIfNew(event: NormalizedEvent, { dedupeKey, seriesKey }: EventKeys): Promise<StoreOutcome> {
    if (dedupeKey && this.seen.has(dedupeKey)) return "duplicate";
    if (seriesKey && event.source_version !== null) {
      const latest = this.latestVersion.get(seriesKey);
      if (latest !== undefined && event.source_version <= latest) return "out_of_order";
      this.latestVersion.set(seriesKey, event.source_version);
    }
    if (dedupeKey) this.seen.add(dedupeKey);
    this.events.push(event);
    return "stored";
  }
}

/**
 * Result of event ingestion
 */
export interface IngestionResult {
  success: boolean;
  event_id: string;
  duplicate?: boolean;
  out_of_order?: boolean;
  error?: string;
}

/**
 * Incident Runtime
 *
 * Manages the incident lifecycle through four stateless ticks:
 * - ingestEvent: normalize + write event, trigger incident rules
 * - tickIncidents: advance open incidents (dispatch operator decisions)
 * - tickTasks: collect completed specialist task results
 * - tickOutbox: flush pending action_receipts via ExecutionGateway
 */
export class IncidentRuntime {
  constructor(
    private readonly clock: Clock,
    private readonly eventStore: EventStore
  ) {}

  /**
   * Ingest a normalized event
   *
   * Phase 2D responsibilities:
   * - Deduplicate by (source, source_event_id)
   * - Handle out-of-order events by source_version
   * - Store event in append-only log
   * - Trigger incident rules (TODO: Phase 3)
   */
  async ingestEvent(event: NormalizedEvent): Promise<IngestionResult> {
    try {
      const outcome = await this.eventStore.storeIfNew(event, {
        dedupeKey: EventNormalizer.getDeduplicationKey(event),
        seriesKey: EventNormalizer.getSeriesKey(event),
      });
      if (outcome === "duplicate") return { success: true, event_id: event.event_id, duplicate: true };
      if (outcome === "out_of_order") return { success: true, event_id: event.event_id, out_of_order: true };

      // TODO Phase 3: Trigger incident rules based on event type
      // - VendorCommitmentChanged → update PO line forecast → recalculate impact → open/update incident
      // - ScheduleRevised → recompute need dates and float
      // - ApprovalGranted → transition incident from AWAITING_APPROVAL
      // - ShipmentReceived → transition to VERIFYING
      // etc.

      return {
        success: true,
        event_id: event.event_id,
      };
    } catch (err) {
      return {
        success: false,
        event_id: event.event_id,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Tick open incidents (Phase 3D)
   * Dispatches operator decisions for incidents that need attention
   */
  async tickIncidents(): Promise<void> {
    // TODO: Implement in Phase 3D
    throw new Error("Not implemented - Phase 3D");
  }

  /**
   * Tick specialist tasks (Phase 3A)
   * Collects completed specialist task results with FOR UPDATE SKIP LOCKED
   */
  async tickTasks(): Promise<void> {
    // TODO: Implement in Phase 3A
    throw new Error("Not implemented - Phase 3A");
  }

  /**
   * Tick outbox (Phase 2E)
   * Flushes pending action_receipts via ExecutionGateway
   */
  async tickOutbox(): Promise<void> {
    // TODO: Implement in Phase 2E
    throw new Error("Not implemented - Phase 2E");
  }
}
