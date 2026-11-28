import { eq, sql } from "drizzle-orm";
import type { NormalizedEvent } from "@pactline/domain";
import type { DB } from "../client.js";
import { domainEvents, eventSeriesVersions } from "../schema/runtime.js";

export type StoreOutcome = "stored" | "duplicate" | "out_of_order";

export interface EventKeys {
  dedupeKey: string | null;
  seriesKey: string | null;
}

/**
 * PostgreSQL-backed EventStore for IncidentRuntime.
 * Structurally satisfies EventStore from @pactline/incident-runtime without importing it.
 */
export class PostgresEventStore {
  constructor(
    private readonly db: DB,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async storeIfNew(
    event: NormalizedEvent,
    { dedupeKey, seriesKey }: EventKeys,
  ): Promise<StoreOutcome> {
    return this.db.transaction(async (tx) => {
      if (seriesKey !== null && event.source_version !== null) {
        // Ensure a row exists for this series so concurrent overlapping deliveries serialize.
        await tx
          .insert(eventSeriesVersions)
          .values({
            seriesKey,
            latestVersion: event.source_version,
            updatedAt: this.clock(),
          })
          .onConflictDoNothing({ target: eventSeriesVersions.seriesKey });

        const [series] = await tx
          .select({ latestVersion: eventSeriesVersions.latestVersion })
          .from(eventSeriesVersions)
          .where(eq(eventSeriesVersions.seriesKey, seriesKey))
          .for("update");

        if (series) {
          if (dedupeKey !== null) {
            const [dup] = await tx
              .select({ id: domainEvents.id })
              .from(domainEvents)
              .where(eq(domainEvents.dedupeKey, dedupeKey))
              .limit(1);
            if (dup) {
              return "duplicate";
            }
          }

          if (event.source_version < series.latestVersion) {
            return "out_of_order";
          }

          if (event.source_version === series.latestVersion) {
            // If this is the first insert that created eventSeriesVersions in this tx,
            // domainEvents won't have any row for this series yet; otherwise it's out_of_order/duplicate.
            const [existingForSeries] = await tx
              .select({ id: domainEvents.id })
              .from(domainEvents)
              .where(eq(domainEvents.seriesKey, seriesKey))
              .limit(1);
            if (existingForSeries) {
              return "out_of_order";
            }
          } else {
            await tx
              .update(eventSeriesVersions)
              .set({
                latestVersion: event.source_version,
                updatedAt: this.clock(),
              })
              .where(eq(eventSeriesVersions.seriesKey, seriesKey));
          }
        }
      }

      const inserted = await tx
        .insert(domainEvents)
        .values({
          eventId: event.event_id,
          type: event.type,
          projectId: event.project_id,
          subjectType: event.subject_type,
          subjectId: event.subject_id,
          occurredAt: event.occurred_at,
          receivedAt: event.received_at,
          source: event.source,
          sourceEventId: event.source_event_id,
          dedupeKey,
          seriesKey,
          sourceVersion: event.source_version,
          evidenceRef: event.evidence_ref,
          correlationId: event.correlation_id,
          payload: event.payload,
          taintedFields: event.tainted_fields,
        })
        .onConflictDoNothing({
          target: domainEvents.dedupeKey,
          where: sql`${domainEvents.dedupeKey} IS NOT NULL`,
        })
        .returning({ id: domainEvents.id });

      return inserted.length === 0 ? "duplicate" : "stored";
    });
  }
}
