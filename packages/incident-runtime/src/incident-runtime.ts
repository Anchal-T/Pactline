// IncidentRuntime — Phase 2D (ingestEvent)
// Four stateless ticks driven by injected Clock per AGENTS.md §4

import type { NormalizedEvent } from "@pactline/domain";

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

/**
 * Event storage interface
 * Actual implementation in @pactline/db
 */
export interface EventStore {
  /**
   * Check if an event with this deduplication key already exists
   */
  isDuplicate(deduplicationKey: string): Promise<boolean>;

  /**
   * Get the existing version for a source event
   */
  getExistingVersion(deduplicationKey: string): Promise<number | null>;

  /**
   * Store a normalized event
   */
  store(event: NormalizedEvent): Promise<void>;
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
      // Check for deduplication key
      const dedupeKey = this.getDeduplicationKey(event);

      if (dedupeKey) {
        // Check if already processed
        const isDupe = await this.eventStore.isDuplicate(dedupeKey);
        if (isDupe) {
          return {
            success: true,
            event_id: event.event_id,
            duplicate: true,
          };
        }

        // Check for out-of-order delivery
        if (event.source_version !== null) {
          const existingVersion = await this.eventStore.getExistingVersion(dedupeKey);
          if (existingVersion !== null && event.source_version <= existingVersion) {
            return {
              success: true,
              event_id: event.event_id,
              out_of_order: true,
            };
          }
        }
      }

      // Store the event
      await this.eventStore.store(event);

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
   * Create deduplication key from event
   */
  private getDeduplicationKey(event: NormalizedEvent): string | null {
    if (!event.source_event_id) {
      return null;
    }
    return `${event.source}:${event.source_event_id}`;
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
