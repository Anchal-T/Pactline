import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { projects } from "./schedule.js";

export const vendors = pgTable("vendors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  contactEmail: text("contact_email"),
  isSandbox: boolean("is_sandbox").notNull().default(true),
  metadata: jsonb("metadata")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const equipmentPackages = pgTable(
  "equipment_packages",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    description: text("description").notNull(),
    requiredQuantity: numeric("required_quantity", {
      precision: 12,
      scale: 3,
    }).notNull(),
    activeRequirementSetId: text("active_requirement_set_id"),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("equipment_packages_project_id_idx").on(t.projectId),
    check(
      "equipment_packages_required_qty_chk",
      sql`${t.requiredQuantity} > 0`,
    ),
  ],
);

export const materialNeeds = pgTable(
  "material_needs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    packageId: text("package_id")
      .notNull()
      .references(() => equipmentPackages.id, { onDelete: "cascade" }),
    activityId: text("activity_id").notNull(),
    requiredQuantity: numeric("required_quantity", {
      precision: 12,
      scale: 3,
    }).notNull(),
    requiredUsableDate: date("required_usable_date", {
      mode: "string",
    }).notNull(),
    readinessBufferDays: integer("readiness_buffer_days").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("material_needs_project_id_idx").on(t.projectId),
    index("material_needs_package_id_idx").on(t.packageId),
    check("material_needs_required_qty_chk", sql`${t.requiredQuantity} > 0`),
    check("material_needs_buffer_chk", sql`${t.readinessBufferDays} >= 0`),
  ],
);

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    vendorId: text("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    status: text("status").notNull(),
    currency: text("currency").notNull().default("USD"),
    commercialTerms: jsonb("commercial_terms").$type<Record<string, unknown>>(),
    releasedOn: date("released_on", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("purchase_orders_project_id_idx").on(t.projectId),
    index("purchase_orders_vendor_id_idx").on(t.vendorId),
  ],
);

export const poLines = pgTable(
  "po_lines",
  {
    id: text("id").primaryKey(),
    poId: text("po_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    packageId: text("package_id")
      .notNull()
      .references(() => equipmentPackages.id, { onDelete: "restrict" }),
    productConfigId: text("product_config_id"),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2 }),
    contractualArrivalDate: date("contractual_arrival_date", {
      mode: "string",
    }).notNull(),
    currentForecastArrivalDate: date("current_forecast_arrival_date", {
      mode: "string",
    }),
    status: text("status").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("po_lines_po_id_idx").on(t.poId),
    index("po_lines_package_id_idx").on(t.packageId),
    check("po_lines_quantity_chk", sql`${t.quantity} > 0`),
  ],
);

export const fulfillmentAllocations = pgTable(
  "fulfillment_allocations",
  {
    id: text("id").primaryKey(),
    poLineId: text("po_line_id")
      .notNull()
      .references(() => poLines.id, { onDelete: "cascade" }),
    materialNeedId: text("material_need_id")
      .notNull()
      .references(() => materialNeeds.id, { onDelete: "cascade" }),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    status: text("status").notNull(),
    incidentId: text("incident_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    releasedAt: timestamp("released_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [
    index("fulfillment_allocations_po_line_id_idx").on(t.poLineId),
    index("fulfillment_allocations_material_need_id_idx").on(t.materialNeedId),
    index("fulfillment_allocations_active_po_line_idx")
      .on(t.poLineId)
      .where(sql`${t.status} = 'ACTIVE'`),
    check("fulfillment_allocations_qty_chk", sql`${t.quantity} > 0`),
    check(
      "fulfillment_allocations_status_chk",
      sql`${t.status} IN ('ACTIVE', 'RELEASED', 'CANCELLED')`,
    ),
  ],
);

export const vendorCommitments = pgTable(
  "vendor_commitments",
  {
    id: uuid("id").default(sql`uuidv7()`).primaryKey(),
    poLineId: text("po_line_id")
      .notNull()
      .references(() => poLines.id, { onDelete: "cascade" }),
    commitmentKind: text("commitment_kind").notNull(),
    promisedArrivalDate: date("promised_arrival_date", {
      mode: "string",
    }).notNull(),
    observedAt: timestamp("observed_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    source: text("source").notNull(),
    sourceEventId: text("source_event_id"),
    sourceVersion: integer("source_version"),
    evidenceRef: text("evidence_ref"),
    taintStatus: text("taint_status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("vendor_commitments_po_line_observed_idx").on(
      t.poLineId,
      t.observedAt,
    ),
    check(
      "vendor_commitments_kind_chk",
      sql`${t.commitmentKind} IN ('CONTRACTUAL', 'ACKNOWLEDGMENT', 'FORECAST', 'ESTIMATE')`,
    ),
    check(
      "vendor_commitments_taint_chk",
      sql`${t.taintStatus} IN ('untrusted', 'verified', 'derived')`,
    ),
  ],
);

export const milestones = pgTable(
  "milestones",
  {
    id: text("id").primaryKey(),
    poLineId: text("po_line_id")
      .notNull()
      .references(() => poLines.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    plannedDate: date("planned_date", { mode: "string" }).notNull(),
    forecastDate: date("forecast_date", { mode: "string" }),
    actualDate: date("actual_date", { mode: "string" }),
    status: text("status").notNull(),
    evidenceRef: text("evidence_ref"),
  },
  (t) => [index("milestones_po_line_id_idx").on(t.poLineId)],
);

export const receipts = pgTable(
  "receipts",
  {
    id: text("id").primaryKey(),
    poLineId: text("po_line_id")
      .notNull()
      .references(() => poLines.id, { onDelete: "cascade" }),
    shippedQty: numeric("shipped_qty", { precision: 12, scale: 3 }).notNull(),
    receivedQty: numeric("received_qty", { precision: 12, scale: 3 }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" }),
    carrierRef: text("carrier_ref"),
    evidenceRef: text("evidence_ref"),
    conditionNotes: text("condition_notes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("receipts_po_line_id_idx").on(t.poLineId),
    check("receipts_shipped_qty_chk", sql`${t.shippedQty} >= 0`),
    check("receipts_received_qty_chk", sql`${t.receivedQty} >= 0`),
  ],
);

export const inspections = pgTable(
  "inspections",
  {
    id: text("id").primaryKey(),
    receiptId: text("receipt_id")
      .notNull()
      .references(() => receipts.id, { onDelete: "cascade" }),
    poLineId: text("po_line_id")
      .notNull()
      .references(() => poLines.id, { onDelete: "cascade" }),
    inspector: text("inspector"),
    inspectedAt: timestamp("inspected_at", {
      withTimezone: true,
      mode: "date",
    }),
    serialNumbers: jsonb("serial_numbers").$type<string[]>(),
    result: text("result").notNull(),
    notes: text("notes"),
    evidenceRef: text("evidence_ref"),
  },
  (t) => [
    index("inspections_receipt_id_idx").on(t.receiptId),
    index("inspections_po_line_id_idx").on(t.poLineId),
    check(
      "inspections_result_chk",
      sql`${t.result} IN ('PASS', 'HOLD', 'FAIL')`,
    ),
  ],
);

export const acceptances = pgTable(
  "acceptances",
  {
    id: text("id").primaryKey(),
    inspectionId: text("inspection_id")
      .notNull()
      .references(() => inspections.id, { onDelete: "cascade" }),
    poLineId: text("po_line_id")
      .notNull()
      .references(() => poLines.id, { onDelete: "cascade" }),
    materialNeedId: text("material_need_id")
      .notNull()
      .references(() => materialNeeds.id, { onDelete: "cascade" }),
    acceptedQty: numeric("accepted_qty", { precision: 12, scale: 3 }).notNull(),
    disposition: text("disposition").notNull(),
    authorizedBy: text("authorized_by").notNull(),
    acceptedAt: timestamp("accepted_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    evidenceRef: text("evidence_ref").notNull(),
  },
  (t) => [
    index("acceptances_inspection_id_idx").on(t.inspectionId),
    index("acceptances_po_line_id_idx").on(t.poLineId),
    index("acceptances_material_need_id_idx").on(t.materialNeedId),
    check("acceptances_qty_chk", sql`${t.acceptedQty} >= 0`),
    check(
      "acceptances_disposition_chk",
      sql`${t.disposition} IN ('ACCEPTED', 'CONDITIONAL', 'REJECTED')`,
    ),
  ],
);
