// WorldStore schema (Neon Postgres). Business keys from data/fixtures are the primary keys.
// Invariants enforced here where a constraint can carry them (AGENTS.md §5): 3 (offer evidence and
// expiry NOT NULL), 7 (baseline immutability, trigger in the custom migration) and 8 (open-incident CHECK).
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const now = (name: string) => ts(name).notNull().defaultNow();

/* ── Project, schedule ─────────────────────────────────────────────── */

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("UTC"),
  created_at: now("created_at"),
});

/** One row per schedule revision. `network` is the schedule-engine input (calendar, activities, dependencies). */
export const scheduleRevisions = pgTable(
  "schedule_revisions",
  {
    id: text("id").primaryKey(),
    project_id: text("project_id").notNull().references(() => projects.id),
    revision: integer("revision").notNull(),
    kind: text("kind", { enum: ["BASELINE", "CURRENT", "SUPERSEDED"] }).notNull(),
    network: jsonb("network").notNull(),
    recorded_at: now("recorded_at"),
  },
  (t) => [uniqueIndex("schedule_revisions_project_rev").on(t.project_id, t.revision)],
);

/* ── Packages, needs, vendors, purchase orders ─────────────────────── */

export const equipmentPackages = pgTable("equipment_packages", {
  id: text("id").primaryKey(),
  project_id: text("project_id").notNull().references(() => projects.id),
  type: text("type").notNull(),
  description: text("description").notNull(),
  required_quantity: integer("required_quantity").notNull(),
  requirement_set_id: text("requirement_set_id"),
  status: text("status").notNull().default("ACTIVE"),
});

export const materialNeeds = pgTable("material_needs", {
  id: text("id").primaryKey(),
  package_id: text("package_id").notNull().references(() => equipmentPackages.id),
  activity_id: text("activity_id").notNull(),
  required_quantity: integer("required_quantity").notNull(),
  required_usable_date: date("required_usable_date", { mode: "string" }).notNull(),
  readiness_buffer_days: integer("readiness_buffer_days").notNull().default(0),
});

export const vendors = pgTable("vendors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sandbox: boolean("sandbox").notNull().default(true),
  /** Allowed outbound addresses (gateway recipient allow-list). */
  contacts: jsonb("contacts").$type<string[]>().notNull().default([]),
});

export const poLines = pgTable("po_lines", {
  id: text("id").primaryKey(),
  po_id: text("po_id").notNull(),
  project_id: text("project_id").notNull().references(() => projects.id),
  package_id: text("package_id").notNull().references(() => equipmentPackages.id),
  vendor_id: text("vendor_id").notNull().references(() => vendors.id),
  product_config_id: text("product_config_id"),
  quantity: integer("quantity").notNull(),
  released_on: date("released_on", { mode: "string" }),
  contractual_arrival_date: date("contractual_arrival_date", { mode: "string" }).notNull(),
  milestones: jsonb("milestones").notNull().default([]),
  version: integer("version").notNull().default(1),
});

export const fulfillmentAllocations = pgTable("fulfillment_allocations", {
  id: text("id").primaryKey(),
  po_line_id: text("po_line_id").notNull().references(() => poLines.id),
  material_need_id: text("material_need_id").notNull().references(() => materialNeeds.id),
  quantity: integer("quantity").notNull(),
  active: boolean("active").notNull().default(true),
});

/** Append-only. A newer commitment closes the previous one by setting valid_to; nothing is updated in place otherwise. */
export const vendorCommitments = pgTable(
  "vendor_commitments",
  {
    id: text("id").primaryKey(),
    po_line_id: text("po_line_id").notNull().references(() => poLines.id),
    kind: text("kind", { enum: ["CONTRACTUAL", "ACKNOWLEDGED", "FORECAST", "PROMISE", "ACTUAL"] }).notNull(),
    arrival_date: date("arrival_date", { mode: "string" }).notNull(),
    status: text("status").notNull(),
    valid_from: ts("valid_from").notNull(),
    valid_to: ts("valid_to"),
    recorded_at: now("recorded_at"),
    source_event_id: text("source_event_id"),
    source_version: integer("source_version"),
    source_ref: text("source_ref"),
    taint: text("taint", { enum: ["untrusted", "verified"] }).notNull().default("untrusted"),
  },
  (t) => [index("vendor_commitments_line").on(t.po_line_id, t.valid_from)],
);

/* ── Requirements, products, offers ────────────────────────────────── */

export const requirementSets = pgTable(
  "requirement_sets",
  {
    id: text("id").notNull(),
    revision: integer("revision").notNull(),
    package_id: text("package_id").notNull(),
    body: jsonb("body").notNull(),
    /** A compiled rule set is used for verdicts only after an engineer approves it. */
    approved_by: text("approved_by"),
    approved_at: ts("approved_at"),
    superseded_at: ts("superseded_at"),
  },
  (t) => [primaryKey({ columns: [t.id, t.revision] })],
);

export const productConfigurations = pgTable(
  "product_configurations",
  {
    id: text("id").notNull(),
    revision: integer("revision").notNull().default(1),
    manufacturer: text("manufacturer").notNull(),
    model: text("model").notNull(),
    body: jsonb("body").notNull(),
    trust: text("trust", { enum: ["AUTHENTIC", "SANDBOX"] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.id, t.revision] })],
);

export const supplierOffers = pgTable(
  "supplier_offers",
  {
    id: text("id").notNull(),
    revision: integer("revision").notNull().default(1),
    vendor_id: text("vendor_id").notNull().references(() => vendors.id),
    product_config_id: text("product_config_id").notNull(),
    quantity: integer("quantity").notNull(),
    unit_price: doublePrecision("unit_price"),
    currency: text("currency"),
    lead_time_weeks_lo: doublePrecision("lead_time_weeks_lo"),
    lead_time_weeks_hi: doublePrecision("lead_time_weeks_hi"),
    lead_time_basis: text("lead_time_basis"),
    regime: text("regime", { enum: ["STOCKED", "ETO"] }),
    // Invariant 3: an offer without evidence or an expiry cannot exist.
    evidence_ref: text("evidence_ref").notNull(),
    expires_at: ts("expires_at").notNull(),
    received_at: now("received_at"),
  },
  (t) => [primaryKey({ columns: [t.id, t.revision] })],
);

/* ── Documents (3B pipeline) ───────────────────────────────────────── */

export const documents = pgTable("documents", {
  id: text("id").primaryKey(),
  uri: text("uri").notNull(),
  title: text("title").notNull(),
  publisher: text("publisher").notNull(),
  kind: text("kind").notNull(),
  mime: text("mime").notNull(),
  content_hash: text("content_hash").notNull().unique(),
  trust_tier: text("trust_tier").notNull(),
  untrusted: boolean("untrusted").notNull(),
  retrieved_at: ts("retrieved_at").notNull(),
  parser: text("parser").notNull(),
});

export const documentBlocks = pgTable(
  "document_blocks",
  {
    id: text("id").primaryKey(),
    document_id: text("document_id").notNull().references(() => documents.id),
    seq: integer("seq").notNull(),
    kind: text("kind", { enum: ["heading", "paragraph", "table_row", "list_item", "figure"] }).notNull(),
    page: integer("page"),
    section: text("section"),
    bbox: jsonb("bbox").$type<[number, number, number, number]>(),
    text: text("text").notNull(),
  },
  (t) => [uniqueIndex("document_blocks_doc_seq").on(t.document_id, t.seq)],
);

/* ── Events, facts ─────────────────────────────────────────────────── */

export const events = pgTable(
  "events",
  {
    event_id: text("event_id").primaryKey(),
    type: text("type").notNull(),
    project_id: text("project_id").notNull(),
    subject_type: text("subject_type").notNull(),
    subject_id: text("subject_id").notNull(),
    occurred_at: ts("occurred_at").notNull(),
    received_at: ts("received_at").notNull(),
    source: text("source").notNull(),
    source_event_id: text("source_event_id"),
    source_version: integer("source_version"),
    evidence_ref: text("evidence_ref"),
    correlation_id: text("correlation_id"),
    payload: jsonb("payload").notNull(),
    tainted_fields: jsonb("tainted_fields").$type<string[]>().notNull().default([]),
  },
  (t) => [uniqueIndex("events_source_dedupe").on(t.source, t.source_event_id)],
);

/** Bi-temporal facts: valid_from/valid_to is when it was true in the world, recorded_at is when we learned it. */
export const facts = pgTable(
  "facts",
  {
    id: text("id").primaryKey(),
    subject: text("subject").notNull(),
    predicate: text("predicate").notNull(),
    value: jsonb("value").notNull(),
    valid_from: ts("valid_from").notNull(),
    valid_to: ts("valid_to"),
    recorded_at: now("recorded_at"),
    superseded_at: ts("superseded_at"),
    source_event_id: text("source_event_id"),
    source_ref: text("source_ref"),
    trust_tier: text("trust_tier").notNull(),
    taint: text("taint", { enum: ["untrusted", "verified"] }).notNull().default("untrusted"),
  },
  (t) => [index("facts_subject_predicate").on(t.subject, t.predicate, t.recorded_at)],
);

/* ── Incidents, plans, specialist tasks ────────────────────────────── */

export const incidents = pgTable(
  "incidents",
  {
    id: text("id").primaryKey(),
    project_id: text("project_id").notNull(),
    po_line_id: text("po_line_id"),
    status: text("status").notNull(),
    severity: text("severity").notNull(),
    owner: text("owner"),
    next_review_at: ts("next_review_at"),
    next_action: text("next_action"),
    blocker: text("blocker"),
    version: integer("version").notNull().default(1),
    opened_at: now("opened_at"),
    closed_at: ts("closed_at"),
  },
  // Invariant 8: every open incident has an owner, a review time and a next action or blocker.
  (t) => [
    check(
      "incidents_open_owned",
      sql`${t.status} = 'CLOSED' OR (${t.owner} IS NOT NULL AND ${t.next_review_at} IS NOT NULL AND (${t.next_action} IS NOT NULL OR ${t.blocker} IS NOT NULL))`,
    ),
  ],
);

export const plans = pgTable(
  "plans",
  {
    id: text("id").primaryKey(),
    incident_id: text("incident_id").notNull().references(() => incidents.id),
    version: integer("version").notNull(),
    goal: text("goal").notNull(),
    reason: text("reason").notNull(),
    /** What changed from the previous version: steps added, removed, changed. */
    diff: jsonb("diff").notNull().default({}),
    created_at: now("created_at"),
  },
  (t) => [uniqueIndex("plans_incident_version").on(t.incident_id, t.version)],
);

export const planSteps = pgTable(
  "plan_steps",
  {
    id: text("id").primaryKey(),
    plan_id: text("plan_id").notNull().references(() => plans.id),
    seq: integer("seq").notNull(),
    kind: text("kind", { enum: ["SPECIALIST", "APPROVAL", "ACTION", "FOLLOW_UP", "VERIFY"] }).notNull(),
    specialist: text("specialist"),
    input: jsonb("input").notNull().default({}),
    depends_on: jsonb("depends_on").$type<string[]>().notNull().default([]),
    status: text("status", { enum: ["PENDING", "RUNNING", "DONE", "BLOCKED", "SKIPPED", "FAILED"] }).notNull().default("PENDING"),
    idempotency_key: text("idempotency_key").notNull(),
    due_at: ts("due_at"),
    task_id: text("task_id"),
  },
  (t) => [uniqueIndex("plan_steps_plan_seq").on(t.plan_id, t.seq)],
);

export const specialistTasks = pgTable(
  "specialist_tasks",
  {
    id: text("id").primaryKey(),
    incident_id: text("incident_id"),
    plan_step_id: text("plan_step_id"),
    parent_task_id: text("parent_task_id"),
    depth: integer("depth").notNull().default(0),
    specialist: text("specialist").notNull(),
    objective: text("objective").notNull(),
    input: jsonb("input").notNull(),
    state_pin: jsonb("state_pin").notNull(),
    evidence_refs: jsonb("evidence_refs").$type<string[]>().notNull().default([]),
    budget: jsonb("budget").notNull(),
    deadline: ts("deadline").notNull(),
    status: text("status", { enum: ["PENDING", "RUNNING", "COMPLETED", "STALE", "FAILED", "TIMED_OUT"] }).notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    lease_expires_at: ts("lease_expires_at"),
    idempotency_key: text("idempotency_key").notNull(),
    result: jsonb("result"),
    result_status: text("result_status"),
    error: text("error"),
    created_at: now("created_at"),
    started_at: ts("started_at"),
    finished_at: ts("finished_at"),
  },
  (t) => [
    uniqueIndex("specialist_tasks_idempotency").on(t.idempotency_key),
    index("specialist_tasks_claim").on(t.status, t.created_at),
  ],
);

/** Idempotent replay cache for specialist runs (docs/03 §3 rule 7). */
export const specialistResults = pgTable("specialist_results", {
  idempotency_key: text("idempotency_key").primaryKey(),
  specialist: text("specialist").notNull(),
  version: text("version").notNull(),
  envelope: jsonb("envelope").notNull(),
  created_at: now("created_at"),
});

/* ── Approvals, outbox, follow-ups, audit ──────────────────────────── */

export const approvals = pgTable("approvals", {
  id: text("id").primaryKey(),
  incident_id: text("incident_id"),
  kind: text("kind").notNull(),
  scope: text("scope").notNull(),
  subject_id: text("subject_id").notNull(),
  required_roles: jsonb("required_roles").$type<string[]>().notNull(),
  pins: jsonb("pins").notNull(),
  status: text("status", { enum: ["REQUESTED", "GRANTED", "REJECTED", "INVALIDATED", "EXPIRED"] }).notNull(),
  granted_role: text("granted_role"),
  granted_by: text("granted_by"),
  granted_at: ts("granted_at"),
  expires_at: ts("expires_at").notNull(),
  reason: text("reason"),
  created_at: now("created_at"),
});

export const actionReceipts = pgTable(
  "action_receipts",
  {
    receipt_id: text("receipt_id").primaryKey(),
    action_id: text("action_id").notNull(),
    idempotency_key: text("idempotency_key").notNull().unique(),
    status: text("status", { enum: ["PENDING", "DISPATCHING", "CONFIRMED", "UNCERTAIN", "FAILED"] }).notNull(),
    action_type: text("action_type").notNull(),
    action_class: text("action_class").notNull(),
    incident_id: text("incident_id"),
    subject_id: text("subject_id"),
    actor: text("actor").notNull(),
    reason: text("reason").notNull(),
    arguments: jsonb("arguments").notNull(),
    tainted_arguments: jsonb("tainted_arguments").$type<string[]>().notNull().default([]),
    approval_id: text("approval_id"),
    recipient: text("recipient"),
    template_id: text("template_id"),
    dispatched_at: ts("dispatched_at"),
    confirmed_at: ts("confirmed_at"),
    external_id: text("external_id"),
    error: text("error"),
    lease_expires_at: ts("lease_expires_at"),
    retry_count: integer("retry_count").notNull().default(0),
    created_at: now("created_at"),
  },
  (t) => [index("action_receipts_dispatch").on(t.status, t.lease_expires_at), index("action_receipts_recipient").on(t.recipient, t.created_at)],
);

export const followUps = pgTable("follow_ups", {
  id: text("id").primaryKey(),
  incident_id: text("incident_id").notNull().references(() => incidents.id),
  kind: text("kind", { enum: ["VENDOR_RESPONSE", "APPROVAL_EXPIRY", "POST_MITIGATION"] }).notNull(),
  due_at: ts("due_at").notNull(),
  attempt: integer("attempt").notNull().default(0),
  max_attempts: integer("max_attempts").notNull(),
  status: text("status", { enum: ["SCHEDULED", "FIRED", "SATISFIED", "ESCALATED", "CANCELLED"] }).notNull().default("SCHEDULED"),
  payload: jsonb("payload").notNull().default({}),
});

export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: ts("at").notNull(),
    kind: text("kind").notNull(),
    incident_id: text("incident_id"),
    subject: text("subject"),
    actor: text("actor").notNull(),
    detail: jsonb("detail").notNull().default({}),
  },
  (t) => [index("audit_events_incident").on(t.incident_id, t.at)],
);
