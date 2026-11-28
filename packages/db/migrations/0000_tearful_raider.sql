CREATE TABLE IF NOT EXISTS "activities" (
	"schedule_revision_id" text NOT NULL,
	"activity_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"duration_workdays" integer NOT NULL,
	"planned_start" date,
	"planned_finish" date,
	"forecast_start" date,
	"forecast_finish" date,
	"actual_start" date,
	"actual_finish" date,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "activities_schedule_revision_id_activity_id_pk" PRIMARY KEY("schedule_revision_id","activity_id"),
	CONSTRAINT "activities_duration_chk" CHECK ("activities"."duration_workdays" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dependencies" (
	"schedule_revision_id" text NOT NULL,
	"predecessor_id" text NOT NULL,
	"successor_id" text NOT NULL,
	"type" text NOT NULL,
	"lag_workdays" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "dependencies_schedule_revision_id_predecessor_id_successor_id_pk" PRIMARY KEY("schedule_revision_id","predecessor_id","successor_id"),
	CONSTRAINT "dependencies_type_chk" CHECK ("dependencies"."type" IN ('FS', 'SS', 'FF', 'SF'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "schedule_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"revision" integer NOT NULL,
	"kind" text NOT NULL,
	"start_date" date NOT NULL,
	"calendar" jsonb NOT NULL,
	"constraints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_revisions_kind_chk" CHECK ("schedule_revisions"."kind" IN ('BASELINE', 'CURRENT', 'SCENARIO'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "acceptances" (
	"id" text PRIMARY KEY NOT NULL,
	"inspection_id" text NOT NULL,
	"po_line_id" text NOT NULL,
	"material_need_id" text NOT NULL,
	"accepted_qty" numeric(12, 3) NOT NULL,
	"disposition" text NOT NULL,
	"authorized_by" text NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"evidence_ref" text NOT NULL,
	CONSTRAINT "acceptances_qty_chk" CHECK ("acceptances"."accepted_qty" >= 0),
	CONSTRAINT "acceptances_disposition_chk" CHECK ("acceptances"."disposition" IN ('ACCEPTED', 'CONDITIONAL', 'REJECTED'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "equipment_packages" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"required_quantity" numeric(12, 3) NOT NULL,
	"active_requirement_set_id" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_packages_required_qty_chk" CHECK ("equipment_packages"."required_quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fulfillment_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"po_line_id" text NOT NULL,
	"material_need_id" text NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"status" text NOT NULL,
	"incident_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "fulfillment_allocations_qty_chk" CHECK ("fulfillment_allocations"."quantity" > 0),
	CONSTRAINT "fulfillment_allocations_status_chk" CHECK ("fulfillment_allocations"."status" IN ('ACTIVE', 'RELEASED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspections" (
	"id" text PRIMARY KEY NOT NULL,
	"receipt_id" text NOT NULL,
	"po_line_id" text NOT NULL,
	"inspector" text,
	"inspected_at" timestamp with time zone,
	"serial_numbers" jsonb,
	"result" text NOT NULL,
	"notes" text,
	"evidence_ref" text,
	CONSTRAINT "inspections_result_chk" CHECK ("inspections"."result" IN ('PASS', 'HOLD', 'FAIL'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "material_needs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"package_id" text NOT NULL,
	"activity_id" text NOT NULL,
	"required_quantity" numeric(12, 3) NOT NULL,
	"required_usable_date" date NOT NULL,
	"readiness_buffer_days" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "material_needs_required_qty_chk" CHECK ("material_needs"."required_quantity" > 0),
	CONSTRAINT "material_needs_buffer_chk" CHECK ("material_needs"."readiness_buffer_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "milestones" (
	"id" text PRIMARY KEY NOT NULL,
	"po_line_id" text NOT NULL,
	"type" text NOT NULL,
	"planned_date" date NOT NULL,
	"forecast_date" date,
	"actual_date" date,
	"status" text NOT NULL,
	"evidence_ref" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "po_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"po_id" text NOT NULL,
	"package_id" text NOT NULL,
	"product_config_id" text,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_price" numeric(14, 2),
	"contractual_arrival_date" date NOT NULL,
	"current_forecast_arrival_date" date,
	"status" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "po_lines_quantity_chk" CHECK ("po_lines"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"vendor_id" text NOT NULL,
	"status" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"commercial_terms" jsonb,
	"released_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"po_line_id" text NOT NULL,
	"shipped_qty" numeric(12, 3) NOT NULL,
	"received_qty" numeric(12, 3) NOT NULL,
	"received_at" timestamp with time zone,
	"carrier_ref" text,
	"evidence_ref" text,
	"condition_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipts_shipped_qty_chk" CHECK ("receipts"."shipped_qty" >= 0),
	CONSTRAINT "receipts_received_qty_chk" CHECK ("receipts"."received_qty" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_commitments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"po_line_id" text NOT NULL,
	"commitment_kind" text NOT NULL,
	"promised_arrival_date" date NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"source_event_id" text,
	"source_version" integer,
	"evidence_ref" text,
	"taint_status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_commitments_kind_chk" CHECK ("vendor_commitments"."commitment_kind" IN ('CONTRACTUAL', 'ACKNOWLEDGMENT', 'FORECAST', 'ESTIMATE')),
	CONSTRAINT "vendor_commitments_taint_chk" CHECK ("vendor_commitments"."taint_status" IN ('untrusted', 'verified', 'derived'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact_email" text,
	"is_sandbox" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "compliance_findings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"requirement_set_id" text NOT NULL,
	"requirement_set_revision" integer NOT NULL,
	"requirement_id" text NOT NULL,
	"product_config_id" text NOT NULL,
	"product_config_revision" integer NOT NULL,
	"evaluator_version" text NOT NULL,
	"result" text NOT NULL,
	"mandatory" boolean NOT NULL,
	"observed" jsonb,
	"explanation" text NOT NULL,
	"evidence_refs" jsonb NOT NULL,
	"review_status" text DEFAULT 'UNREVIEWED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compliance_findings_result_chk" CHECK ("compliance_findings"."result" IN ('PASS', 'FAIL', 'UNKNOWN', 'NOT_APPLICABLE')),
	CONSTRAINT "compliance_findings_pass_evidence_chk" CHECK ("compliance_findings"."result" <> 'PASS' OR jsonb_array_length("compliance_findings"."evidence_refs") > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"publisher" text,
	"title" text,
	"document_name" text,
	"revision" text,
	"locator" jsonb,
	"uri" text,
	"content_hash" text,
	"trust_tier" text NOT NULL,
	"retrieved_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_configurations" (
	"id" text PRIMARY KEY NOT NULL,
	"manufacturer" text NOT NULL,
	"family" text,
	"model" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"equipment_type" text NOT NULL,
	"specs" jsonb NOT NULL,
	"source_refs" jsonb NOT NULL,
	"trust_tier" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "requirement_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"package_id" text NOT NULL,
	"revision" integer NOT NULL,
	"duty_point" jsonb,
	"scope_note" text,
	"status" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"source_refs" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requirement_sets_status_chk" CHECK ("requirement_sets"."status" IN ('DRAFT', 'APPROVED', 'SUPERSEDED'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "requirements" (
	"id" text PRIMARY KEY NOT NULL,
	"requirement_set_id" text NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"predicate" jsonb NOT NULL,
	"mandatory" boolean NOT NULL,
	"tolerance" jsonb,
	"applies_when" jsonb,
	"evidence_needed" text,
	"source_refs" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supplier_offers" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"vendor_id" text NOT NULL,
	"product_config_id" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_price" numeric(14, 2),
	"currency" text NOT NULL,
	"quoted_arrival_date" date,
	"lead_time_days" integer,
	"quoted_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"evidence_ref" text NOT NULL,
	"availability_status" text,
	"is_sandbox" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_offers_quantity_chk" CHECK ("supplier_offers"."quantity" > 0),
	CONSTRAINT "supplier_offers_evidence_nonempty_chk" CHECK (btrim("supplier_offers"."evidence_ref") <> ''),
	CONSTRAINT "supplier_offers_expiry_chk" CHECK ("supplier_offers"."expires_at" > "supplier_offers"."quoted_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"incident_id" text,
	"recovery_plan_id" text,
	"scope" text NOT NULL,
	"subject_id" text NOT NULL,
	"granted_by" text NOT NULL,
	"granted_role" text NOT NULL,
	"outcome" text NOT NULL,
	"requirement_rev" text,
	"config_rev" text,
	"offer_rev" text,
	"plan_rev" text,
	"schedule_rev" text,
	"granted_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"invalidated_at" timestamp with time zone,
	"invalidation_reason" text,
	"evidence_ref" text,
	CONSTRAINT "approvals_granted_role_chk" CHECK ("approvals"."granted_role" IN ('OPERATOR', 'PROCUREMENT_MANAGER', 'ENGINEER_OF_RECORD', 'PROJECT_MANAGER')),
	CONSTRAINT "approvals_outcome_chk" CHECK ("approvals"."outcome" IN ('GRANTED', 'REJECTED')),
	CONSTRAINT "approvals_expiry_chk" CHECK ("approvals"."expires_at" > "approvals"."granted_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "incident_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"incident_id" text NOT NULL,
	"event_type" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"actor" text NOT NULL,
	"reason" text,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "incidents" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"package_id" text NOT NULL,
	"material_need_id" text NOT NULL,
	"po_line_id" text,
	"trigger_event_id" uuid,
	"severity" text NOT NULL,
	"status" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"owner" text,
	"next_action" text,
	"blocker" text,
	"next_review_at" timestamp with time zone,
	"required_qty" numeric(12, 3) NOT NULL,
	"accepted_qty" numeric(12, 3) DEFAULT '0' NOT NULL,
	"waiver_approval_id" text,
	"schedule_disposition" text,
	"cause_hypotheses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lease_holder" text,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "incidents_severity_chk" CHECK ("incidents"."severity" IN ('CRITICAL', 'WARNING', 'FLOAT_ABSORBED', 'NONE')),
	CONSTRAINT "incidents_status_chk" CHECK ("incidents"."status" IN ('DETECTED', 'INVESTIGATING', 'PLANNING', 'AWAITING_APPROVAL', 'EXECUTING', 'MITIGATED', 'VERIFYING', 'CLOSED', 'ESCALATED', 'BLOCKED')),
	CONSTRAINT "incidents_required_qty_chk" CHECK ("incidents"."required_qty" >= 0),
	CONSTRAINT "incidents_accepted_qty_chk" CHECK ("incidents"."accepted_qty" >= 0),
	CONSTRAINT "incidents_closure_invariant_chk" CHECK ("incidents"."status" <> 'CLOSED' OR "incidents"."accepted_qty" >= "incidents"."required_qty" OR ("incidents"."waiver_approval_id" IS NOT NULL AND "incidents"."schedule_disposition" IS NOT NULL)),
	CONSTRAINT "incidents_open_invariant_chk" CHECK ("incidents"."status" = 'CLOSED' OR ("incidents"."owner" IS NOT NULL AND "incidents"."next_review_at" IS NOT NULL AND ("incidents"."next_action" IS NOT NULL OR "incidents"."blocker" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recovery_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"recovery_plan_id" text NOT NULL,
	"seq" integer NOT NULL,
	"action_type" text NOT NULL,
	"description" text NOT NULL,
	"subject_id" text,
	"depends_on_action_id" text,
	"status" text NOT NULL,
	"required_approval_role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recovery_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"incident_id" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"expected_usable_date" date,
	"cost_delta" numeric(14, 2),
	"currency" text,
	"risk_summary" text,
	"constraints_checked" jsonb,
	"completion_criteria" jsonb,
	"evidence_refs" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subject_revisions" (
	"subject_id" text PRIMARY KEY NOT NULL,
	"subject_type" text NOT NULL,
	"requirement_rev" text,
	"config_rev" text,
	"offer_rev" text,
	"plan_rev" text,
	"schedule_rev" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "action_receipts" (
	"receipt_id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"action_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text NOT NULL,
	"action_type" text NOT NULL,
	"action_class" text NOT NULL,
	"incident_id" text,
	"subject_id" text,
	"actor" text NOT NULL,
	"reason" text NOT NULL,
	"arguments" jsonb NOT NULL,
	"tainted_arguments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approval_id" text,
	"recipient" text,
	"template_id" text,
	"dispatched_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"external_id" text,
	"error" text,
	"lease_expires_at" timestamp with time zone,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "action_receipts_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "action_receipts_status_chk" CHECK ("action_receipts"."status" IN ('PENDING', 'DISPATCHING', 'CONFIRMED', 'UNCERTAIN', 'FAILED')),
	CONSTRAINT "action_receipts_class_chk" CHECK ("action_receipts"."action_class" IN ('READ', 'DRAFT', 'EXTERNAL_WRITE', 'BINDING')),
	CONSTRAINT "action_receipts_binding_approval_chk" CHECK ("action_receipts"."action_class" <> 'BINDING' OR "action_receipts"."approval_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "domain_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"event_id" uuid NOT NULL,
	"type" text NOT NULL,
	"project_id" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"source_event_id" text,
	"dedupe_key" text,
	"series_key" text,
	"source_version" integer,
	"evidence_ref" text,
	"correlation_id" text,
	"payload" jsonb NOT NULL,
	"tainted_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_series_versions" (
	"series_key" text PRIMARY KEY NOT NULL,
	"latest_version" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "specialist_result_cache" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"specialist" text NOT NULL,
	"version" text NOT NULL,
	"envelope" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "specialist_tasks" (
	"task_id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"incident_id" text,
	"project_id" text NOT NULL,
	"role" text NOT NULL,
	"objective" text NOT NULL,
	"input_payload" jsonb NOT NULL,
	"state_pin" jsonb NOT NULL,
	"status" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"lease_holder" text,
	"lease_expires_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"result_envelope" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "specialist_tasks_status_chk" CHECK ("specialist_tasks"."status" IN ('PENDING', 'CLAIMED', 'COMPLETED', 'STALE', 'FAILED', 'CANCELLED'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activities" ADD CONSTRAINT "activities_schedule_revision_id_schedule_revisions_id_fk" FOREIGN KEY ("schedule_revision_id") REFERENCES "public"."schedule_revisions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_predecessor_fk" FOREIGN KEY ("schedule_revision_id","predecessor_id") REFERENCES "public"."activities"("schedule_revision_id","activity_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_successor_fk" FOREIGN KEY ("schedule_revision_id","successor_id") REFERENCES "public"."activities"("schedule_revision_id","activity_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "schedule_revisions" ADD CONSTRAINT "schedule_revisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "acceptances" ADD CONSTRAINT "acceptances_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "acceptances" ADD CONSTRAINT "acceptances_po_line_id_po_lines_id_fk" FOREIGN KEY ("po_line_id") REFERENCES "public"."po_lines"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "acceptances" ADD CONSTRAINT "acceptances_material_need_id_material_needs_id_fk" FOREIGN KEY ("material_need_id") REFERENCES "public"."material_needs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "equipment_packages" ADD CONSTRAINT "equipment_packages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fulfillment_allocations" ADD CONSTRAINT "fulfillment_allocations_po_line_id_po_lines_id_fk" FOREIGN KEY ("po_line_id") REFERENCES "public"."po_lines"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fulfillment_allocations" ADD CONSTRAINT "fulfillment_allocations_material_need_id_material_needs_id_fk" FOREIGN KEY ("material_need_id") REFERENCES "public"."material_needs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspections" ADD CONSTRAINT "inspections_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspections" ADD CONSTRAINT "inspections_po_line_id_po_lines_id_fk" FOREIGN KEY ("po_line_id") REFERENCES "public"."po_lines"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "material_needs" ADD CONSTRAINT "material_needs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "material_needs" ADD CONSTRAINT "material_needs_package_id_equipment_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."equipment_packages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "milestones" ADD CONSTRAINT "milestones_po_line_id_po_lines_id_fk" FOREIGN KEY ("po_line_id") REFERENCES "public"."po_lines"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "po_lines" ADD CONSTRAINT "po_lines_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "po_lines" ADD CONSTRAINT "po_lines_package_id_equipment_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."equipment_packages"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "receipts" ADD CONSTRAINT "receipts_po_line_id_po_lines_id_fk" FOREIGN KEY ("po_line_id") REFERENCES "public"."po_lines"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_commitments" ADD CONSTRAINT "vendor_commitments_po_line_id_po_lines_id_fk" FOREIGN KEY ("po_line_id") REFERENCES "public"."po_lines"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compliance_findings" ADD CONSTRAINT "compliance_findings_requirement_set_id_requirement_sets_id_fk" FOREIGN KEY ("requirement_set_id") REFERENCES "public"."requirement_sets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compliance_findings" ADD CONSTRAINT "compliance_findings_requirement_id_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirements"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compliance_findings" ADD CONSTRAINT "compliance_findings_product_config_id_product_configurations_id_fk" FOREIGN KEY ("product_config_id") REFERENCES "public"."product_configurations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "requirement_sets" ADD CONSTRAINT "requirement_sets_package_id_equipment_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."equipment_packages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "requirements" ADD CONSTRAINT "requirements_requirement_set_id_requirement_sets_id_fk" FOREIGN KEY ("requirement_set_id") REFERENCES "public"."requirement_sets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier_offers" ADD CONSTRAINT "supplier_offers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier_offers" ADD CONSTRAINT "supplier_offers_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier_offers" ADD CONSTRAINT "supplier_offers_product_config_id_product_configurations_id_fk" FOREIGN KEY ("product_config_id") REFERENCES "public"."product_configurations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approvals" ADD CONSTRAINT "approvals_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approvals" ADD CONSTRAINT "approvals_recovery_plan_id_recovery_plans_id_fk" FOREIGN KEY ("recovery_plan_id") REFERENCES "public"."recovery_plans"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incident_audit_events" ADD CONSTRAINT "incident_audit_events_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incidents" ADD CONSTRAINT "incidents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incidents" ADD CONSTRAINT "incidents_package_id_equipment_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."equipment_packages"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incidents" ADD CONSTRAINT "incidents_material_need_id_material_needs_id_fk" FOREIGN KEY ("material_need_id") REFERENCES "public"."material_needs"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incidents" ADD CONSTRAINT "incidents_po_line_id_po_lines_id_fk" FOREIGN KEY ("po_line_id") REFERENCES "public"."po_lines"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recovery_actions" ADD CONSTRAINT "recovery_actions_recovery_plan_id_recovery_plans_id_fk" FOREIGN KEY ("recovery_plan_id") REFERENCES "public"."recovery_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recovery_plans" ADD CONSTRAINT "recovery_plans_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "action_receipts" ADD CONSTRAINT "action_receipts_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "action_receipts" ADD CONSTRAINT "action_receipts_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "specialist_tasks" ADD CONSTRAINT "specialist_tasks_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_schedule_revision_id_idx" ON "activities" USING btree ("schedule_revision_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dependencies_pred_idx" ON "dependencies" USING btree ("schedule_revision_id","predecessor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dependencies_succ_idx" ON "dependencies" USING btree ("schedule_revision_id","successor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "schedule_revisions_project_id_idx" ON "schedule_revisions" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "schedule_revisions_project_rev_uidx" ON "schedule_revisions" USING btree ("project_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "schedule_revisions_baseline_uidx" ON "schedule_revisions" USING btree ("project_id") WHERE "schedule_revisions"."kind" = 'BASELINE';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acceptances_inspection_id_idx" ON "acceptances" USING btree ("inspection_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acceptances_po_line_id_idx" ON "acceptances" USING btree ("po_line_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acceptances_material_need_id_idx" ON "acceptances" USING btree ("material_need_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "equipment_packages_project_id_idx" ON "equipment_packages" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fulfillment_allocations_po_line_id_idx" ON "fulfillment_allocations" USING btree ("po_line_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fulfillment_allocations_material_need_id_idx" ON "fulfillment_allocations" USING btree ("material_need_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fulfillment_allocations_active_po_line_idx" ON "fulfillment_allocations" USING btree ("po_line_id") WHERE "fulfillment_allocations"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inspections_receipt_id_idx" ON "inspections" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inspections_po_line_id_idx" ON "inspections" USING btree ("po_line_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "material_needs_project_id_idx" ON "material_needs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "material_needs_package_id_idx" ON "material_needs" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "milestones_po_line_id_idx" ON "milestones" USING btree ("po_line_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "po_lines_po_id_idx" ON "po_lines" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "po_lines_package_id_idx" ON "po_lines" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_orders_project_id_idx" ON "purchase_orders" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_orders_vendor_id_idx" ON "purchase_orders" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "receipts_po_line_id_idx" ON "receipts" USING btree ("po_line_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendor_commitments_po_line_observed_idx" ON "vendor_commitments" USING btree ("po_line_id","observed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compliance_findings_req_set_idx" ON "compliance_findings" USING btree ("requirement_set_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compliance_findings_req_idx" ON "compliance_findings" USING btree ("requirement_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compliance_findings_config_idx" ON "compliance_findings" USING btree ("product_config_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "requirement_sets_package_id_idx" ON "requirement_sets" USING btree ("package_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "requirement_sets_package_rev_uidx" ON "requirement_sets" USING btree ("package_id","revision");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "requirements_requirement_set_id_idx" ON "requirements" USING btree ("requirement_set_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_offers_project_id_idx" ON "supplier_offers" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_offers_vendor_id_idx" ON "supplier_offers" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_offers_product_config_id_idx" ON "supplier_offers" USING btree ("product_config_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approvals_incident_id_idx" ON "approvals" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approvals_recovery_plan_id_idx" ON "approvals" USING btree ("recovery_plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approvals_active_subject_idx" ON "approvals" USING btree ("subject_id","expires_at") WHERE "approvals"."outcome" = 'GRANTED' AND "approvals"."invalidated_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incident_audit_events_incident_occurred_idx" ON "incident_audit_events" USING btree ("incident_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incidents_project_id_idx" ON "incidents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incidents_package_id_idx" ON "incidents" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incidents_material_need_id_idx" ON "incidents" USING btree ("material_need_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incidents_po_line_id_idx" ON "incidents" USING btree ("po_line_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incidents_open_review_idx" ON "incidents" USING btree ("next_review_at") WHERE "incidents"."status" <> 'CLOSED';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recovery_actions_plan_id_idx" ON "recovery_actions" USING btree ("recovery_plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recovery_plans_incident_id_idx" ON "recovery_plans" USING btree ("incident_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recovery_plans_incident_rev_uidx" ON "recovery_plans" USING btree ("incident_id","revision");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "action_receipts_incident_id_idx" ON "action_receipts" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "action_receipts_approval_id_idx" ON "action_receipts" USING btree ("approval_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "action_receipts_dispatchable_idx" ON "action_receipts" USING btree ("status","lease_expires_at") WHERE "action_receipts"."status" IN ('PENDING', 'DISPATCHING');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "action_receipts_recipient_created_idx" ON "action_receipts" USING btree ("recipient","created_at") WHERE "action_receipts"."recipient" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "domain_events_dedupe_key_uidx" ON "domain_events" USING btree ("dedupe_key") WHERE "domain_events"."dedupe_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "domain_events_project_occurred_idx" ON "domain_events" USING btree ("project_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "specialist_tasks_incident_id_idx" ON "specialist_tasks" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "specialist_tasks_claimable_idx" ON "specialist_tasks" USING btree ("status","lease_expires_at") WHERE "specialist_tasks"."status" IN ('PENDING', 'CLAIMED');