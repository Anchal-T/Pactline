import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  equipmentPackages,
  materialNeeds,
  poLines,
} from "./procurement.js";
import { projects } from "./schedule.js";

export const subjectRevisions = pgTable("subject_revisions", {
  subjectId: text("subject_id").primaryKey(),
  subjectType: text("subject_type").notNull(),
  requirementRev: text("requirement_rev"),
  configRev: text("config_rev"),
  offerRev: text("offer_rev"),
  planRev: text("plan_rev"),
  scheduleRev: text("schedule_rev"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const incidents = pgTable(
  "incidents",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    packageId: text("package_id")
      .notNull()
      .references(() => equipmentPackages.id, { onDelete: "restrict" }),
    materialNeedId: text("material_need_id")
      .notNull()
      .references(() => materialNeeds.id, { onDelete: "restrict" }),
    poLineId: text("po_line_id").references(() => poLines.id, {
      onDelete: "set null",
    }),
    triggerEventId: uuid("trigger_event_id"),
    severity: text("severity").notNull(),
    status: text("status").notNull(),
    version: integer("version").notNull().default(1),
    owner: text("owner"),
    nextAction: text("next_action"),
    blocker: text("blocker"),
    nextReviewAt: timestamp("next_review_at", {
      withTimezone: true,
      mode: "date",
    }),
    requiredQty: numeric("required_qty", {
      precision: 12,
      scale: 3,
    }).notNull(),
    acceptedQty: numeric("accepted_qty", { precision: 12, scale: 3 })
      .notNull()
      .default("0"),
    waiverApprovalId: text("waiver_approval_id"),
    scheduleDisposition: text("schedule_disposition"),
    causeHypotheses: jsonb("cause_hypotheses")
      .$type<unknown[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    leaseHolder: text("lease_holder"),
    leaseExpiresAt: timestamp("lease_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [
    index("incidents_project_id_idx").on(t.projectId),
    index("incidents_package_id_idx").on(t.packageId),
    index("incidents_material_need_id_idx").on(t.materialNeedId),
    index("incidents_po_line_id_idx").on(t.poLineId),
    index("incidents_open_review_idx")
      .on(t.nextReviewAt)
      .where(sql`${t.status} <> 'CLOSED'`),
    check(
      "incidents_severity_chk",
      sql`${t.severity} IN ('CRITICAL', 'WARNING', 'FLOAT_ABSORBED', 'NONE')`,
    ),
    check(
      "incidents_status_chk",
      sql`${t.status} IN ('DETECTED', 'INVESTIGATING', 'PLANNING', 'AWAITING_APPROVAL', 'EXECUTING', 'MITIGATED', 'VERIFYING', 'CLOSED', 'ESCALATED', 'BLOCKED')`,
    ),
    check("incidents_required_qty_chk", sql`${t.requiredQty} >= 0`),
    check("incidents_accepted_qty_chk", sql`${t.acceptedQty} >= 0`),
    check(
      "incidents_closure_invariant_chk",
      sql`${t.status} <> 'CLOSED' OR ${t.acceptedQty} >= ${t.requiredQty} OR (${t.waiverApprovalId} IS NOT NULL AND ${t.scheduleDisposition} IS NOT NULL)`,
    ),
    check(
      "incidents_open_invariant_chk",
      sql`${t.status} = 'CLOSED' OR (${t.owner} IS NOT NULL AND ${t.nextReviewAt} IS NOT NULL AND (${t.nextAction} IS NOT NULL OR ${t.blocker} IS NOT NULL))`,
    ),
  ],
);

export const recoveryPlans = pgTable(
  "recovery_plans",
  {
    id: text("id").primaryKey(),
    incidentId: text("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull().default(1),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    expectedUsableDate: date("expected_usable_date", { mode: "string" }),
    costDelta: numeric("cost_delta", { precision: 14, scale: 2 }),
    currency: text("currency"),
    riskSummary: text("risk_summary"),
    constraintsChecked: jsonb("constraints_checked").$type<unknown[]>(),
    completionCriteria: jsonb("completion_criteria").$type<unknown[]>(),
    evidenceRefs: jsonb("evidence_refs").$type<unknown[]>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("recovery_plans_incident_id_idx").on(t.incidentId),
    uniqueIndex("recovery_plans_incident_rev_uidx").on(
      t.incidentId,
      t.revision,
    ),
  ],
);

export const recoveryActions = pgTable(
  "recovery_actions",
  {
    id: text("id").primaryKey(),
    recoveryPlanId: text("recovery_plan_id")
      .notNull()
      .references(() => recoveryPlans.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    actionType: text("action_type").notNull(),
    description: text("description").notNull(),
    subjectId: text("subject_id"),
    dependsOnActionId: text("depends_on_action_id"),
    status: text("status").notNull(),
    requiredApprovalRole: text("required_approval_role"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("recovery_actions_plan_id_idx").on(t.recoveryPlanId)],
);

export const approvals = pgTable(
  "approvals",
  {
    id: text("id").primaryKey(),
    incidentId: text("incident_id").references(() => incidents.id, {
      onDelete: "cascade",
    }),
    recoveryPlanId: text("recovery_plan_id").references(
      () => recoveryPlans.id,
      { onDelete: "set null" },
    ),
    scope: text("scope").notNull(),
    subjectId: text("subject_id").notNull(),
    grantedBy: text("granted_by").notNull(),
    grantedRole: text("granted_role").notNull(),
    outcome: text("outcome").notNull(),
    requirementRev: text("requirement_rev"),
    configRev: text("config_rev"),
    offerRev: text("offer_rev"),
    planRev: text("plan_rev"),
    scheduleRev: text("schedule_rev"),
    grantedAt: timestamp("granted_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    invalidatedAt: timestamp("invalidated_at", {
      withTimezone: true,
      mode: "date",
    }),
    invalidationReason: text("invalidation_reason"),
    evidenceRef: text("evidence_ref"),
  },
  (t) => [
    index("approvals_incident_id_idx").on(t.incidentId),
    index("approvals_recovery_plan_id_idx").on(t.recoveryPlanId),
    index("approvals_active_subject_idx")
      .on(t.subjectId, t.expiresAt)
      .where(sql`${t.outcome} = 'GRANTED' AND ${t.invalidatedAt} IS NULL`),
    check(
      "approvals_granted_role_chk",
      sql`${t.grantedRole} IN ('OPERATOR', 'PROCUREMENT_MANAGER', 'ENGINEER_OF_RECORD', 'PROJECT_MANAGER')`,
    ),
    check("approvals_outcome_chk", sql`${t.outcome} IN ('GRANTED', 'REJECTED')`),
    check("approvals_expiry_chk", sql`${t.expiresAt} > ${t.grantedAt}`),
  ],
);

export const incidentAuditEvents = pgTable(
  "incident_audit_events",
  {
    id: uuid("id").default(sql`uuidv7()`).primaryKey(),
    incidentId: text("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    actor: text("actor").notNull(),
    reason: text("reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
  },
  (t) => [
    index("incident_audit_events_incident_occurred_idx").on(
      t.incidentId,
      t.occurredAt,
    ),
  ],
);
