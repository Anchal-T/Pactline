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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { equipmentPackages, vendors } from "./procurement.js";
import { projects } from "./schedule.js";

export const evidenceSources = pgTable("evidence_sources", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  publisher: text("publisher"),
  title: text("title"),
  documentName: text("document_name"),
  revision: text("revision"),
  locator: jsonb("locator").$type<Record<string, unknown>>(),
  uri: text("uri"),
  contentHash: text("content_hash"),
  trustTier: text("trust_tier").notNull(),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true, mode: "date" }),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
});

export const requirementSets = pgTable(
  "requirement_sets",
  {
    id: text("id").primaryKey(),
    packageId: text("package_id")
      .notNull()
      .references(() => equipmentPackages.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    dutyPoint: jsonb("duty_point").$type<Record<string, unknown>>(),
    scopeNote: text("scope_note"),
    status: text("status").notNull(),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "date" }),
    sourceRefs: jsonb("source_refs").$type<unknown[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("requirement_sets_package_id_idx").on(t.packageId),
    uniqueIndex("requirement_sets_package_rev_uidx").on(
      t.packageId,
      t.revision,
    ),
    check(
      "requirement_sets_status_chk",
      sql`${t.status} IN ('DRAFT', 'APPROVED', 'SUPERSEDED')`,
    ),
  ],
);

export const requirements = pgTable(
  "requirements",
  {
    id: text("id").primaryKey(),
    requirementSetId: text("requirement_set_id")
      .notNull()
      .references(() => requirementSets.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    kind: text("kind").notNull(),
    predicate: jsonb("predicate").$type<Record<string, unknown>>().notNull(),
    mandatory: boolean("mandatory").notNull(),
    tolerance: jsonb("tolerance").$type<Record<string, unknown>>(),
    appliesWhen: jsonb("applies_when").$type<Record<string, unknown>>(),
    evidenceNeeded: text("evidence_needed"),
    sourceRefs: jsonb("source_refs").$type<unknown[]>().notNull(),
  },
  (t) => [index("requirements_requirement_set_id_idx").on(t.requirementSetId)],
);

export const productConfigurations = pgTable("product_configurations", {
  id: text("id").primaryKey(),
  manufacturer: text("manufacturer").notNull(),
  family: text("family"),
  model: text("model").notNull(),
  revision: integer("revision").notNull().default(1),
  equipmentType: text("equipment_type").notNull(),
  specs: jsonb("specs").$type<Record<string, unknown>>().notNull(),
  sourceRefs: jsonb("source_refs").$type<unknown[]>().notNull(),
  trustTier: text("trust_tier").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const complianceFindings = pgTable(
  "compliance_findings",
  {
    id: uuid("id").default(sql`uuidv7()`).primaryKey(),
    requirementSetId: text("requirement_set_id")
      .notNull()
      .references(() => requirementSets.id, { onDelete: "cascade" }),
    requirementSetRevision: integer("requirement_set_revision").notNull(),
    requirementId: text("requirement_id")
      .notNull()
      .references(() => requirements.id, { onDelete: "cascade" }),
    productConfigId: text("product_config_id")
      .notNull()
      .references(() => productConfigurations.id, { onDelete: "cascade" }),
    productConfigRevision: integer("product_config_revision").notNull(),
    evaluatorVersion: text("evaluator_version").notNull(),
    result: text("result").notNull(),
    mandatory: boolean("mandatory").notNull(),
    observed: jsonb("observed").$type<Record<string, unknown>>(),
    explanation: text("explanation").notNull(),
    evidenceRefs: jsonb("evidence_refs").$type<unknown[]>().notNull(),
    reviewStatus: text("review_status").notNull().default("UNREVIEWED"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("compliance_findings_req_set_idx").on(t.requirementSetId),
    index("compliance_findings_req_idx").on(t.requirementId),
    index("compliance_findings_config_idx").on(t.productConfigId),
    check(
      "compliance_findings_result_chk",
      sql`${t.result} IN ('PASS', 'FAIL', 'UNKNOWN', 'NOT_APPLICABLE')`,
    ),
    check(
      "compliance_findings_pass_evidence_chk",
      sql`${t.result} <> 'PASS' OR jsonb_array_length(${t.evidenceRefs}) > 0`,
    ),
  ],
);

export const supplierOffers = pgTable(
  "supplier_offers",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    vendorId: text("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    productConfigId: text("product_config_id")
      .notNull()
      .references(() => productConfigurations.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull().default(1),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2 }),
    currency: text("currency").notNull(),
    quotedArrivalDate: date("quoted_arrival_date", { mode: "string" }),
    leadTimeDays: integer("lead_time_days"),
    quotedAt: timestamp("quoted_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    evidenceRef: text("evidence_ref").notNull(),
    availabilityStatus: text("availability_status"),
    isSandbox: boolean("is_sandbox").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("supplier_offers_project_id_idx").on(t.projectId),
    index("supplier_offers_vendor_id_idx").on(t.vendorId),
    index("supplier_offers_product_config_id_idx").on(t.productConfigId),
    check("supplier_offers_quantity_chk", sql`${t.quantity} > 0`),
    check(
      "supplier_offers_evidence_nonempty_chk",
      sql`btrim(${t.evidenceRef}) <> ''`,
    ),
    check(
      "supplier_offers_expiry_chk",
      sql`${t.expiresAt} > ${t.quotedAt}`,
    ),
  ],
);
