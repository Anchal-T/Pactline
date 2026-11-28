import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("UTC"),
  metadata: jsonb("metadata")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const scheduleRevisions = pgTable(
  "schedule_revisions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    kind: text("kind").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    calendar: jsonb("calendar").$type<Record<string, unknown>>().notNull(),
    constraints: jsonb("constraints")
      .$type<unknown[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    effectiveAt: timestamp("effective_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("schedule_revisions_project_id_idx").on(t.projectId),
    uniqueIndex("schedule_revisions_project_rev_uidx").on(t.projectId, t.revision),
    uniqueIndex("schedule_revisions_baseline_uidx")
      .on(t.projectId)
      .where(sql`${t.kind} = 'BASELINE'`),
    check(
      "schedule_revisions_kind_chk",
      sql`${t.kind} IN ('BASELINE', 'CURRENT', 'SCENARIO')`,
    ),
  ],
);

export const activities = pgTable(
  "activities",
  {
    scheduleRevisionId: text("schedule_revision_id")
      .notNull()
      .references(() => scheduleRevisions.id, { onDelete: "cascade" }),
    activityId: text("activity_id").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    durationWorkdays: integer("duration_workdays").notNull(),
    plannedStart: date("planned_start", { mode: "string" }),
    plannedFinish: date("planned_finish", { mode: "string" }),
    forecastStart: date("forecast_start", { mode: "string" }),
    forecastFinish: date("forecast_finish", { mode: "string" }),
    actualStart: date("actual_start", { mode: "string" }),
    actualFinish: date("actual_finish", { mode: "string" }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (t) => [
    primaryKey({ columns: [t.scheduleRevisionId, t.activityId] }),
    index("activities_schedule_revision_id_idx").on(t.scheduleRevisionId),
    check("activities_duration_chk", sql`${t.durationWorkdays} >= 0`),
  ],
);

export const dependencies = pgTable(
  "dependencies",
  {
    scheduleRevisionId: text("schedule_revision_id").notNull(),
    predecessorId: text("predecessor_id").notNull(),
    successorId: text("successor_id").notNull(),
    type: text("type").notNull(),
    lagWorkdays: integer("lag_workdays").notNull().default(0),
  },
  (t) => [
    primaryKey({
      columns: [t.scheduleRevisionId, t.predecessorId, t.successorId],
    }),
    foreignKey({
      columns: [t.scheduleRevisionId, t.predecessorId],
      foreignColumns: [activities.scheduleRevisionId, activities.activityId],
      name: "dependencies_predecessor_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.scheduleRevisionId, t.successorId],
      foreignColumns: [activities.scheduleRevisionId, activities.activityId],
      name: "dependencies_successor_fk",
    }).onDelete("cascade"),
    index("dependencies_pred_idx").on(t.scheduleRevisionId, t.predecessorId),
    index("dependencies_succ_idx").on(t.scheduleRevisionId, t.successorId),
    check("dependencies_type_chk", sql`${t.type} IN ('FS', 'SS', 'FF', 'SF')`),
  ],
);
