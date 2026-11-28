CREATE TABLE IF NOT EXISTS "action_receipts" (
	"receipt_id" text PRIMARY KEY NOT NULL,
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
	CONSTRAINT "action_receipts_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"incident_id" text,
	"kind" text NOT NULL,
	"scope" text NOT NULL,
	"subject_id" text NOT NULL,
	"required_roles" jsonb NOT NULL,
	"pins" jsonb NOT NULL,
	"status" text NOT NULL,
	"granted_role" text,
	"granted_by" text,
	"granted_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"incident_id" text,
	"subject" text,
	"actor" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"seq" integer NOT NULL,
	"kind" text NOT NULL,
	"page" integer,
	"section" text,
	"bbox" jsonb,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"uri" text NOT NULL,
	"title" text NOT NULL,
	"publisher" text NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"content_hash" text NOT NULL,
	"trust_tier" text NOT NULL,
	"untrusted" boolean NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"parser" text NOT NULL,
	CONSTRAINT "documents_content_hash_unique" UNIQUE("content_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "equipment_packages" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"required_quantity" integer NOT NULL,
	"requirement_set_id" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"project_id" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"source_event_id" text,
	"source_version" integer,
	"evidence_ref" text,
	"correlation_id" text,
	"payload" jsonb NOT NULL,
	"tainted_fields" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "facts" (
	"id" text PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"predicate" text NOT NULL,
	"value" jsonb NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"source_event_id" text,
	"source_ref" text,
	"trust_tier" text NOT NULL,
	"taint" text DEFAULT 'untrusted' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "follow_ups" (
	"id" text PRIMARY KEY NOT NULL,
	"incident_id" text NOT NULL,
	"kind" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer NOT NULL,
	"status" text DEFAULT 'SCHEDULED' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fulfillment_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"po_line_id" text NOT NULL,
	"material_need_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "incidents" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"po_line_id" text,
	"status" text NOT NULL,
	"severity" text NOT NULL,
	"owner" text,
	"next_review_at" timestamp with time zone,
	"next_action" text,
	"blocker" text,
	"version" integer DEFAULT 1 NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "incidents_open_owned" CHECK ("incidents"."status" = 'CLOSED' OR ("incidents"."owner" IS NOT NULL AND "incidents"."next_review_at" IS NOT NULL AND ("incidents"."next_action" IS NOT NULL OR "incidents"."blocker" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "material_needs" (
	"id" text PRIMARY KEY NOT NULL,
	"package_id" text NOT NULL,
	"activity_id" text NOT NULL,
	"required_quantity" integer NOT NULL,
	"required_usable_date" date NOT NULL,
	"readiness_buffer_days" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plan_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"seq" integer NOT NULL,
	"kind" text NOT NULL,
	"specialist" text,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"depends_on" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"idempotency_key" text NOT NULL,
	"due_at" timestamp with time zone,
	"task_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"incident_id" text NOT NULL,
	"version" integer NOT NULL,
	"goal" text NOT NULL,
	"reason" text NOT NULL,
	"diff" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "po_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"po_id" text NOT NULL,
	"project_id" text NOT NULL,
	"package_id" text NOT NULL,
	"vendor_id" text NOT NULL,
	"product_config_id" text,
	"quantity" integer NOT NULL,
	"released_on" date,
	"contractual_arrival_date" date NOT NULL,
	"milestones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_configurations" (
	"id" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"manufacturer" text NOT NULL,
	"model" text NOT NULL,
	"body" jsonb NOT NULL,
	"trust" text NOT NULL,
	CONSTRAINT "product_configurations_id_revision_pk" PRIMARY KEY("id","revision")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "requirement_sets" (
	"id" text NOT NULL,
	"revision" integer NOT NULL,
	"package_id" text NOT NULL,
	"body" jsonb NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	CONSTRAINT "requirement_sets_id_revision_pk" PRIMARY KEY("id","revision")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "schedule_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"revision" integer NOT NULL,
	"kind" text NOT NULL,
	"network" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "specialist_results" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"specialist" text NOT NULL,
	"version" text NOT NULL,
	"envelope" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "specialist_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"incident_id" text,
	"plan_step_id" text,
	"parent_task_id" text,
	"depth" integer DEFAULT 0 NOT NULL,
	"specialist" text NOT NULL,
	"objective" text NOT NULL,
	"input" jsonb NOT NULL,
	"state_pin" jsonb NOT NULL,
	"evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"budget" jsonb NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"idempotency_key" text NOT NULL,
	"result" jsonb,
	"result_status" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supplier_offers" (
	"id" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"vendor_id" text NOT NULL,
	"product_config_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" double precision,
	"currency" text,
	"lead_time_weeks_lo" double precision,
	"lead_time_weeks_hi" double precision,
	"lead_time_basis" text,
	"regime" text,
	"evidence_ref" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_offers_id_revision_pk" PRIMARY KEY("id","revision")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_commitments" (
	"id" text PRIMARY KEY NOT NULL,
	"po_line_id" text NOT NULL,
	"kind" text NOT NULL,
	"arrival_date" date NOT NULL,
	"status" text NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_event_id" text,
	"source_version" integer,
	"source_ref" text,
	"taint" text DEFAULT 'untrusted' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sandbox" boolean DEFAULT true NOT NULL,
	"contacts" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_blocks" ADD CONSTRAINT "document_blocks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "equipment_packages" ADD CONSTRAINT "equipment_packages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fulfillment_allocations" ADD CONSTRAINT "fulfillment_allocations_po_line_id_po_lines_id_fk" FOREIGN KEY ("po_line_id") REFERENCES "public"."po_lines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fulfillment_allocations" ADD CONSTRAINT "fulfillment_allocations_material_need_id_material_needs_id_fk" FOREIGN KEY ("material_need_id") REFERENCES "public"."material_needs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "material_needs" ADD CONSTRAINT "material_needs_package_id_equipment_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."equipment_packages"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plan_steps" ADD CONSTRAINT "plan_steps_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plans" ADD CONSTRAINT "plans_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "po_lines" ADD CONSTRAINT "po_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "po_lines" ADD CONSTRAINT "po_lines_package_id_equipment_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."equipment_packages"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "po_lines" ADD CONSTRAINT "po_lines_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "schedule_revisions" ADD CONSTRAINT "schedule_revisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier_offers" ADD CONSTRAINT "supplier_offers_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_commitments" ADD CONSTRAINT "vendor_commitments_po_line_id_po_lines_id_fk" FOREIGN KEY ("po_line_id") REFERENCES "public"."po_lines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "action_receipts_dispatch" ON "action_receipts" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "action_receipts_recipient" ON "action_receipts" USING btree ("recipient","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_incident" ON "audit_events" USING btree ("incident_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_blocks_doc_seq" ON "document_blocks" USING btree ("document_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "events_source_dedupe" ON "events" USING btree ("source","source_event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "facts_subject_predicate" ON "facts" USING btree ("subject","predicate","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plan_steps_plan_seq" ON "plan_steps" USING btree ("plan_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plans_incident_version" ON "plans" USING btree ("incident_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "schedule_revisions_project_rev" ON "schedule_revisions" USING btree ("project_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "specialist_tasks_idempotency" ON "specialist_tasks" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "specialist_tasks_claim" ON "specialist_tasks" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendor_commitments_line" ON "vendor_commitments" USING btree ("po_line_id","valid_from");