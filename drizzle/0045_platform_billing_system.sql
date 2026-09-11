CREATE TYPE "public"."platform_plan_sync_status" AS ENUM('pending', 'synced', 'not_connected', 'failed');--> statement-breakpoint
CREATE TYPE "public"."platform_usage_metric" AS ENUM('talent_sessions', 'house_programs', 'one_offs');--> statement-breakpoint
CREATE TYPE "public"."platform_billing_alert_kind" AS ENUM('payment_failed', 'payment_resolved', 'overage_heads_up');--> statement-breakpoint
CREATE TYPE "public"."platform_billing_audience" AS ENUM('owner', 'hotel');--> statement-breakpoint

ALTER TABLE "platform_subscriptions" ADD COLUMN "stripe_subscription_item_id" text;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD COLUMN "stripe_product_id" text;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD COLUMN "stripe_price_id" text;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD COLUMN "one_off_allowance" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD COLUMN "unit_amount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD COLUMN "starts_on" date DEFAULT CURRENT_DATE NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD COLUMN "renews_on" date DEFAULT CURRENT_DATE NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD COLUMN "payment_failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD COLUMN "payment_failure_message" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD COLUMN "last_stripe_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD COLUMN "updated_by_user_id" uuid;--> statement-breakpoint

UPDATE "platform_subscriptions"
SET "unit_amount_cents" = GREATEST("talent_session_unit_amount_cents", "house_program_unit_amount_cents"),
    "starts_on" = COALESCE("created_at"::date, CURRENT_DATE),
    "renews_on" = GREATEST(COALESCE("next_charge_at"::date, CURRENT_DATE), COALESCE("created_at"::date, CURRENT_DATE));--> statement-breakpoint

ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" DROP CONSTRAINT "platform_subscriptions_unit_amounts_nonnegative";--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_unit_amounts_nonnegative" CHECK ("platform_subscriptions"."talent_session_unit_amount_cents" >= 0 AND "platform_subscriptions"."house_program_unit_amount_cents" >= 0 AND "platform_subscriptions"."unit_amount_cents" >= 0);--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_allowance_nonnegative" CHECK ("platform_subscriptions"."one_off_allowance" >= 0);--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_revision_positive" CHECK ("platform_subscriptions"."revision" > 0);--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_dates_valid" CHECK ("platform_subscriptions"."renews_on" >= "platform_subscriptions"."starts_on");--> statement-breakpoint

ALTER TABLE "platform_subscription_invoices" ADD COLUMN "invoice_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_subscription_invoices" ADD COLUMN "plan_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_subscription_invoices" ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_subscription_invoices" ADD COLUMN "stripe_pdf_url" text;--> statement-breakpoint
ALTER TABLE "platform_subscription_invoices" ADD COLUMN "pdf_storage_path" text;--> statement-breakpoint
ALTER TABLE "platform_subscription_invoices" ADD COLUMN "pdf_sha256" text;--> statement-breakpoint
ALTER TABLE "platform_subscription_invoices" ADD COLUMN "pdf_byte_size" integer;--> statement-breakpoint
ALTER TABLE "platform_subscription_invoices" ADD COLUMN "pdf_generated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_subscription_invoices" ADD COLUMN "pdf_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "platform_subscription_invoices" ADD CONSTRAINT "platform_subscription_invoices_currency_valid" CHECK ("platform_subscription_invoices"."currency" = 'USD');--> statement-breakpoint
ALTER TABLE "platform_subscription_invoices" ADD CONSTRAINT "platform_subscription_invoices_pdf_size_positive" CHECK ("platform_subscription_invoices"."pdf_byte_size" IS NULL OR "platform_subscription_invoices"."pdf_byte_size" > 0);--> statement-breakpoint
ALTER TABLE "platform_subscription_invoices" ADD CONSTRAINT "platform_subscription_invoices_plan_revision_positive" CHECK ("platform_subscription_invoices"."plan_revision" > 0);--> statement-breakpoint

CREATE TABLE "platform_subscription_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "platform_subscription_id" uuid NOT NULL,
  "residency_id" uuid NOT NULL,
  "revision" integer NOT NULL,
  "cadence" "platform_billing_cadence" NOT NULL,
  "talent_program_sessions" integer NOT NULL,
  "house_programs" integer NOT NULL,
  "one_off_allowance" integer NOT NULL,
  "unit_amount_cents" integer NOT NULL,
  "starts_on" date NOT NULL,
  "renews_on" date NOT NULL,
  "change_reason" text NOT NULL,
  "changed_by_user_id" uuid,
  "stripe_sync_status" "platform_plan_sync_status" DEFAULT 'pending' NOT NULL,
  "stripe_sync_error" text DEFAULT '' NOT NULL,
  "stripe_price_id" text,
  "synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "platform_subscription_revisions_revision_positive" CHECK ("platform_subscription_revisions"."revision" > 0),
  CONSTRAINT "platform_subscription_revisions_values_valid" CHECK ("platform_subscription_revisions"."talent_program_sessions" >= 0 AND "platform_subscription_revisions"."house_programs" >= 0 AND "platform_subscription_revisions"."one_off_allowance" >= 0 AND "platform_subscription_revisions"."unit_amount_cents" >= 0),
  CONSTRAINT "platform_subscription_revisions_dates_valid" CHECK ("platform_subscription_revisions"."renews_on" >= "platform_subscription_revisions"."starts_on")
);--> statement-breakpoint

CREATE TABLE "platform_usage_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "residency_id" uuid NOT NULL,
  "platform_subscription_id" uuid NOT NULL,
  "snapshot_date" date NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "talent_sessions" integer DEFAULT 0 NOT NULL,
  "house_programs" integer DEFAULT 0 NOT NULL,
  "one_offs" integer DEFAULT 0 NOT NULL,
  "captured_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "platform_usage_snapshots_period_valid" CHECK ("platform_usage_snapshots"."period_end" >= "platform_usage_snapshots"."period_start" AND "platform_usage_snapshots"."snapshot_date" >= "platform_usage_snapshots"."period_start" AND "platform_usage_snapshots"."snapshot_date" <= "platform_usage_snapshots"."period_end"),
  CONSTRAINT "platform_usage_snapshots_counts_nonnegative" CHECK ("platform_usage_snapshots"."talent_sessions" >= 0 AND "platform_usage_snapshots"."house_programs" >= 0 AND "platform_usage_snapshots"."one_offs" >= 0)
);--> statement-breakpoint

CREATE TABLE "platform_overage_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "residency_id" uuid NOT NULL,
  "platform_subscription_id" uuid NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "metric" "platform_usage_metric" NOT NULL,
  "committed_count" integer NOT NULL,
  "live_count" integer NOT NULL,
  "over_by" integer NOT NULL,
  "first_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "notified_at" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  CONSTRAINT "platform_overage_events_period_valid" CHECK ("platform_overage_events"."period_end" >= "platform_overage_events"."period_start"),
  CONSTRAINT "platform_overage_events_counts_valid" CHECK ("platform_overage_events"."committed_count" >= 0 AND "platform_overage_events"."live_count" > "platform_overage_events"."committed_count" AND "platform_overage_events"."over_by" = "platform_overage_events"."live_count" - "platform_overage_events"."committed_count")
);--> statement-breakpoint

CREATE TABLE "stripe_webhook_events" (
  "id" text PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "livemode" boolean NOT NULL,
  "status" text DEFAULT 'processing' NOT NULL,
  "error" text DEFAULT '' NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone,
  CONSTRAINT "stripe_webhook_events_test_only" CHECK ("stripe_webhook_events"."livemode" = false),
  CONSTRAINT "stripe_webhook_events_status_valid" CHECK ("stripe_webhook_events"."status" IN ('processing', 'processed', 'failed'))
);--> statement-breakpoint

CREATE TABLE "platform_billing_alerts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "residency_id" uuid NOT NULL,
  "platform_subscription_id" uuid NOT NULL,
  "kind" "platform_billing_alert_kind" NOT NULL,
  "audience" "platform_billing_audience" NOT NULL,
  "recipient_email" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "status" "delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "error" text DEFAULT '' NOT NULL,
  "attempted_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "platform_billing_alerts_recipient_valid" CHECK (length(btrim("platform_billing_alerts"."recipient_email")) > 3)
);--> statement-breakpoint

ALTER TABLE "platform_subscription_revisions" ADD CONSTRAINT "platform_subscription_revisions_platform_subscription_id_platform_subscriptions_id_fk" FOREIGN KEY ("platform_subscription_id") REFERENCES "public"."platform_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscription_revisions" ADD CONSTRAINT "platform_subscription_revisions_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscription_revisions" ADD CONSTRAINT "platform_subscription_revisions_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_usage_snapshots" ADD CONSTRAINT "platform_usage_snapshots_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_usage_snapshots" ADD CONSTRAINT "platform_usage_snapshots_platform_subscription_id_platform_subscriptions_id_fk" FOREIGN KEY ("platform_subscription_id") REFERENCES "public"."platform_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_overage_events" ADD CONSTRAINT "platform_overage_events_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_overage_events" ADD CONSTRAINT "platform_overage_events_platform_subscription_id_platform_subscriptions_id_fk" FOREIGN KEY ("platform_subscription_id") REFERENCES "public"."platform_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_billing_alerts" ADD CONSTRAINT "platform_billing_alerts_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_billing_alerts" ADD CONSTRAINT "platform_billing_alerts_platform_subscription_id_platform_subscriptions_id_fk" FOREIGN KEY ("platform_subscription_id") REFERENCES "public"."platform_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "platform_subscription_revisions_subscription_revision_unique" ON "platform_subscription_revisions" USING btree ("platform_subscription_id", "revision");--> statement-breakpoint
CREATE INDEX "platform_subscription_revisions_residency_created_idx" ON "platform_subscription_revisions" USING btree ("residency_id", "created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_usage_snapshots_residency_date_unique" ON "platform_usage_snapshots" USING btree ("residency_id", "snapshot_date");--> statement-breakpoint
CREATE INDEX "platform_usage_snapshots_subscription_period_idx" ON "platform_usage_snapshots" USING btree ("platform_subscription_id", "period_start", "period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_overage_events_residency_period_metric_unique" ON "platform_overage_events" USING btree ("residency_id", "period_start", "metric");--> statement-breakpoint
CREATE INDEX "platform_overage_events_open_idx" ON "platform_overage_events" USING btree ("period_end", "notified_at", "resolved_at");--> statement-breakpoint
CREATE INDEX "stripe_webhook_events_status_received_idx" ON "stripe_webhook_events" USING btree ("status", "received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_billing_alerts_idempotency_unique" ON "platform_billing_alerts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "platform_billing_alerts_pending_idx" ON "platform_billing_alerts" USING btree ("status", "created_at");--> statement-breakpoint

CREATE OR REPLACE FUNCTION validate_platform_billing_child_scope() RETURNS trigger AS $$
DECLARE
  expected_residency_id uuid;
BEGIN
  SELECT residency_id INTO expected_residency_id FROM platform_subscriptions WHERE id = NEW.platform_subscription_id;
  IF expected_residency_id IS NULL OR NEW.residency_id <> expected_residency_id THEN
    RAISE EXCEPTION 'Platform billing record Residency must match its subscription Residency.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER "platform_subscription_revisions_validate_scope" BEFORE INSERT OR UPDATE OF "platform_subscription_id", "residency_id" ON "platform_subscription_revisions" FOR EACH ROW EXECUTE FUNCTION validate_platform_billing_child_scope();--> statement-breakpoint
CREATE TRIGGER "platform_usage_snapshots_validate_scope" BEFORE INSERT OR UPDATE OF "platform_subscription_id", "residency_id" ON "platform_usage_snapshots" FOR EACH ROW EXECUTE FUNCTION validate_platform_billing_child_scope();--> statement-breakpoint
CREATE TRIGGER "platform_overage_events_validate_scope" BEFORE INSERT OR UPDATE OF "platform_subscription_id", "residency_id" ON "platform_overage_events" FOR EACH ROW EXECUTE FUNCTION validate_platform_billing_child_scope();--> statement-breakpoint
CREATE TRIGGER "platform_billing_alerts_validate_scope" BEFORE INSERT OR UPDATE OF "platform_subscription_id", "residency_id" ON "platform_billing_alerts" FOR EACH ROW EXECUTE FUNCTION validate_platform_billing_child_scope();--> statement-breakpoint

INSERT INTO "platform_subscription_revisions" (
  "platform_subscription_id", "residency_id", "revision", "cadence", "talent_program_sessions", "house_programs",
  "one_off_allowance", "unit_amount_cents", "starts_on", "renews_on", "change_reason", "stripe_sync_status", "stripe_price_id", "synced_at"
)
SELECT "id", "residency_id", "revision", "cadence", "talent_program_sessions", "house_programs",
  "one_off_allowance", "unit_amount_cents", "starts_on", "renews_on", 'Migration baseline',
  CASE WHEN "stripe_subscription_id" IS NULL THEN 'not_connected'::platform_plan_sync_status ELSE 'synced'::platform_plan_sync_status END,
  "stripe_price_id", CASE WHEN "stripe_subscription_id" IS NULL THEN NULL ELSE now() END
FROM "platform_subscriptions";--> statement-breakpoint

ALTER TABLE "platform_subscription_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "platform_usage_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "platform_overage_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stripe_webhook_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "platform_billing_alerts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "platform_subscription_revisions", "platform_usage_snapshots", "platform_overage_events", "stripe_webhook_events", "platform_billing_alerts" FROM anon, authenticated;
