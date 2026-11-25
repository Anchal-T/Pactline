// Pactline API Server — Hono on Node.js
// Serves: REST endpoints, WebSocket for live dashboard updates, event ingress webhook
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";

const app = new Hono();
app.use(logger());

// Health check
app.get("/health", (c) => c.json({ status: "ok", service: "pactline-api" }));

// Routes (to be wired as packages are implemented)
// app.route("/api/events", eventsRoute);
// app.route("/api/incidents", incidentsRoute);
// app.route("/api/approvals", approvalsRoute);
// app.route("/api/schedule", scheduleRoute);
// app.route("/api/compliance", complianceRoute);
// app.route("/api/recovery", recoveryRoute);
// app.route("/api/agents", agentActivityRoute);

const port = Number(process.env.PORT ?? 3001);
console.log(`Pactline API listening on http://localhost:${port}`);

serve({ fetch: app.fetch, port });
