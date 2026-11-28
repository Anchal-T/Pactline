CREATE TABLE IF NOT EXISTS "incident_action_proposals" (
	"action_id" text PRIMARY KEY NOT NULL,
	"incident_id" text NOT NULL,
	"proposal" jsonb NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"handed_off_at" timestamp with time zone,
	"receipt_id" uuid,
	"error" text
);

--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "lease_token" uuid;
--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "follow_ups" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "review_failures" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "specialist_tasks" ADD COLUMN "pin_subject_id" text;
--> statement-breakpoint
ALTER TABLE "specialist_tasks" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "specialist_tasks" ADD COLUMN "available_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "specialist_tasks" ADD COLUMN "lease_token" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incident_action_proposals" ADD CONSTRAINT "incident_action_proposals_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incident_action_proposals" ADD CONSTRAINT "incident_action_proposals_receipt_id_action_receipts_receipt_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."action_receipts"("receipt_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incident_action_proposals_incident_id_idx" ON "incident_action_proposals" USING btree ("incident_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incident_action_proposals_pending_idx" ON "incident_action_proposals" USING btree ("recorded_at","action_id") WHERE "incident_action_proposals"."handed_off_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_follow_ups_chk" CHECK ("incidents"."follow_ups" >= 0);
--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_review_failures_chk" CHECK ("incidents"."review_failures" >= 0);
