// POST /api/events/ingest — webhook for external events (vendor, schedule, submittal)
// Deduplicates by source_event_id, normalizes envelope, triggers IncidentRuntime.ingestEvent
import { Hono } from "hono";

export const eventsRoute = new Hono();

eventsRoute.post("/ingest", async (c) => {
  // TODO: validate EventEnvelope schema, call IncidentRuntime.ingestEvent()
  return c.json({ received: true }, 202);
});
