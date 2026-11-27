// POST /api/events/ingest — webhook for external events (vendor, schedule, submittal)
// Deduplicates by source_event_id, normalizes envelope, triggers IncidentRuntime.ingestEvent
import { Hono } from "hono";
import { EventNormalizer, type NormalizedEvent } from "@pactline/domain";

export const eventsRoute = new Hono();

eventsRoute.post("/ingest", async (c) => {
  try {
    const body = await c.req.json();

    // Normalize and validate the event envelope
    const normResult = EventNormalizer.normalize(body);

    if (!normResult.success) {
      return c.json(
        {
          error: "Invalid event envelope",
          details: normResult.error,
        },
        400
      );
    }

    const event = normResult.event!;

    // Validate required payload fields
    const payloadError = EventNormalizer.validatePayload(event);
    if (payloadError) {
      return c.json(
        {
          error: "Invalid event payload",
          details: payloadError,
        },
        400
      );
    }

    // TODO: Check for duplicate by deduplication key in DB
    // TODO: Handle out-of-order events by version
    // TODO: Store event in events table
    // TODO: Trigger IncidentRuntime.ingestEvent() for processing

    // For now, return accepted with normalized event info
    return c.json(
      {
        received: true,
        event_id: event.event_id,
        type: event.type,
        normalized_at: new Date().toISOString(),
        tainted_fields: event.tainted_fields,
      },
      202
    );
  } catch (err) {
    console.error("Event ingestion error:", err);
    return c.json(
      {
        error: "Internal server error",
        details: err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
});
