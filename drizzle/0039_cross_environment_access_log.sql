CREATE TABLE "cross_environment_access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"recorded_by" text NOT NULL,
	"actor_user_id" uuid,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"residency_slug" text NOT NULL,
	"source_project_id" text NOT NULL,
	"source_environment" text NOT NULL,
	"source_subject" text NOT NULL,
	"source_issuer" text NOT NULL,
	"source_deployment" text,
	"source_commit_sha" text,
	"source_git_ref" text,
	"outcome" text DEFAULT 'started' NOT NULL,
	"http_status" integer,
	"reason_code" text,
	"record_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "cross_environment_access_recorded_by_valid" CHECK ("recorded_by" IN ('staging_caller', 'production_export')),
	CONSTRAINT "cross_environment_access_action_valid" CHECK ("action" IN ('preview', 'apply')),
	CONSTRAINT "cross_environment_access_outcome_valid" CHECK ("outcome" IN ('started', 'succeeded', 'failed', 'denied'))
);--> statement-breakpoint
CREATE UNIQUE INDEX "cross_environment_access_request_location_unique" ON "cross_environment_access_log" USING btree ("request_id", "recorded_by");--> statement-breakpoint
CREATE INDEX "cross_environment_access_outcome_started_idx" ON "cross_environment_access_log" USING btree ("outcome", "started_at");--> statement-breakpoint
ALTER TABLE "cross_environment_access_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "cross_environment_access_log" FROM anon, authenticated;
