import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { approvals, incidents } from "./incidents.js";

export const domainEvents = pgTable(
  "domain_events",
  {
    id: uuid("id").default(sql`uuidv7()`).primaryKey(),
    eventId: uuid("event_id").notNull(),
    type: text("type").notNull(),
    projectId: text("project_id").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    receivedAt: timestamp("received_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    source: text("source").notNull(),
    sourceEventId: text("source_event_id"),
    dedupeKey: text("dedupe_key"),
    seriesKey: text("series_key"),
    sourceVersion: integer("source_version"),
    evidenceRef: text("evidence_ref"),
    correlationId: text("correlation_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    taintedFields: jsonb("tainted_fields")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("domain_events_dedupe_key_uidx")
      .on(t.dedupeKey)
      .where(sql`${t.dedupeKey} IS NOT NULL`),
    index("domain_events_project_occurred_idx").on(t.projectId, t.occurredAt),
  ],
);

export const eventSeriesVersions = pgTable("event_series_versions", {
  seriesKey: text("series_key").primaryKey(),
  latestVersion: integer("latest_version").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const actionReceipts = pgTable(
  "action_receipts",
  {
    receiptId: uuid("receipt_id").default(sql`uuidv7()`).primaryKey(),
    actionId: text("action_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    status: text("status").notNull(),
    actionType: text("action_type").notNull(),
    actionClass: text("action_class").notNull(),
    incidentId: text("incident_id").references(() => incidents.id, {
      onDelete: "set null",
    }),
    subjectId: text("subject_id"),
    actor: text("actor").notNull(),
    reason: text("reason").notNull(),
    arguments: jsonb("arguments").$type<Record<string, unknown>>().notNull(),
    taintedArguments: jsonb("tainted_arguments")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    approvalId: text("approval_id").references(() => approvals.id, {
      onDelete: "restrict",
    }),
    recipient: text("recipient"),
    templateId: text("template_id"),
    dispatchedAt: timestamp("dispatched_at", {
      withTimezone: true,
      mode: "date",
    }),
    confirmedAt: timestamp("confirmed_at", {
      withTimezone: true,
      mode: "date",
    }),
    externalId: text("external_id"),
    error: text("error"),
    leaseExpiresAt: timestamp("lease_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    retryCount: integer("retry_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("action_receipts_incident_id_idx").on(t.incidentId),
    index("action_receipts_approval_id_idx").on(t.approvalId),
    index("action_receipts_dispatchable_idx")
      .on(t.status, t.leaseExpiresAt)
      .where(sql`${t.status} IN ('PENDING', 'DISPATCHING')`),
    index("action_receipts_recipient_created_idx")
      .on(t.recipient, t.createdAt)
      .where(sql`${t.recipient} IS NOT NULL`),
    check(
      "action_receipts_status_chk",
      sql`${t.status} IN ('PENDING', 'DISPATCHING', 'CONFIRMED', 'UNCERTAIN', 'FAILED')`,
    ),
    check(
      "action_receipts_class_chk",
      sql`${t.actionClass} IN ('READ', 'DRAFT', 'EXTERNAL_WRITE', 'BINDING')`,
    ),
    check(
      "action_receipts_binding_approval_chk",
      sql`${t.actionClass} <> 'BINDING' OR ${t.approvalId} IS NOT NULL`,
    ),
  ],
);

export const specialistTasks = pgTable(
  "specialist_tasks",
  {
    taskId: uuid("task_id").default(sql`uuidv7()`).primaryKey(),
    incidentId: text("incident_id").references(() => incidents.id, {
      onDelete: "cascade",
    }),
    projectId: text("project_id").notNull(),
    role: text("role").notNull(),
    objective: text("objective").notNull(),
    inputPayload: jsonb("input_payload")
      .$type<Record<string, unknown>>()
      .notNull(),
    statePin: jsonb("state_pin").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    leaseHolder: text("lease_holder"),
    leaseExpiresAt: timestamp("lease_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    deadlineAt: timestamp("deadline_at", { withTimezone: true, mode: "date" }),
    resultEnvelope: jsonb("result_envelope").$type<Record<string, unknown>>(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (t) => [
    index("specialist_tasks_incident_id_idx").on(t.incidentId),
    index("specialist_tasks_claimable_idx")
      .on(t.status, t.leaseExpiresAt)
      .where(sql`${t.status} IN ('PENDING', 'CLAIMED')`),
    check(
      "specialist_tasks_status_chk",
      sql`${t.status} IN ('PENDING', 'CLAIMED', 'COMPLETED', 'STALE', 'FAILED', 'CANCELLED')`,
    ),
  ],
);

export const specialistResultCache = pgTable("specialist_result_cache", {
  idempotencyKey: text("idempotency_key").primaryKey(),
  specialist: text("specialist").notNull(),
  version: text("version").notNull(),
  envelope: jsonb("envelope").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const entityRecordHistory = pgTable(
  "entity_record_history",
  {
    id: uuid("id").default(sql`uuidv7()`).primaryKey(),
    tableName: text("table_name").notNull(),
    recordKey: jsonb("record_key").$type<Record<string, string>>().notNull(),
    version: integer("version").notNull(),
    operation: text("operation").notNull(),
    oldRecord: jsonb("old_record").$type<Record<string, unknown>>(),
    newRecord: jsonb("new_record").$type<Record<string, unknown>>(),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    transactionId: text("transaction_id").notNull(),
  },
  (t) => [
    index("entity_record_history_lookup_idx").on(t.tableName, t.recordedAt.desc()),
    uniqueIndex("entity_record_history_version_uidx").on(
      t.tableName,
      t.recordKey,
      t.version,
    ),
    check(
      "entity_record_history_operation_chk",
      sql`${t.operation} IN ('UPDATE', 'DELETE')`,
    ),
    check("entity_record_history_version_chk", sql`${t.version} > 0`),
  ],
);
