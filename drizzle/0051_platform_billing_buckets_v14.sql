DO $$
DECLARE
  invalid_talent integer;
  invalid_house integer;
BEGIN
  SELECT MAX(value) INTO invalid_talent FROM (
    SELECT "talent_program_sessions" AS value FROM "platform_subscriptions"
    UNION ALL
    SELECT "talent_program_sessions" AS value FROM "platform_subscription_revisions"
  ) legacy WHERE value > 60;
  IF invalid_talent IS NOT NULL THEN
    RAISE EXCEPTION 'HFYOS v14 migration aborted: legacy Talent count % exceeds the 60-slot standard maximum; enterprise pricing requires manual review.', invalid_talent;
  END IF;

  SELECT MAX(value) INTO invalid_house FROM (
    SELECT "house_programs" AS value FROM "platform_subscriptions"
    UNION ALL
    SELECT "house_programs" AS value FROM "platform_subscription_revisions"
  ) legacy WHERE value > 15;
  IF invalid_house IS NOT NULL THEN
    RAISE EXCEPTION 'HFYOS v14 migration aborted: legacy House count % exceeds the 15-slot standard maximum; custom pricing requires manual review.', invalid_house;
  END IF;
END $$;--> statement-breakpoint

CREATE TYPE "public"."platform_subscription_term" AS ENUM('month_to_month', 'annual');--> statement-breakpoint
CREATE TYPE "public"."platform_refund_status" AS ENUM('pending', 'processed', 'void');--> statement-breakpoint

ALTER TABLE "platform_subscriptions"
  ADD COLUMN "term" "platform_subscription_term",
  ADD COLUMN "talent_bucket_size" integer,
  ADD COLUMN "house_bucket_size" integer,
  ADD COLUMN "slot_unit_amount_cents" integer DEFAULT 3000;--> statement-breakpoint

ALTER TABLE "platform_subscription_revisions"
  ADD COLUMN "term" "platform_subscription_term",
  ADD COLUMN "talent_bucket_size" integer,
  ADD COLUMN "house_bucket_size" integer,
  ADD COLUMN "slot_unit_amount_cents" integer DEFAULT 3000;--> statement-breakpoint

UPDATE "platform_subscriptions" SET
  "term" = CASE WHEN "cadence" = 'annual' THEN 'annual'::platform_subscription_term ELSE 'month_to_month'::platform_subscription_term END,
  "talent_bucket_size" = CASE
    WHEN "talent_program_sessions" <= 10 THEN 10
    WHEN "talent_program_sessions" <= 20 THEN 20
    WHEN "talent_program_sessions" <= 30 THEN 30
    WHEN "talent_program_sessions" <= 40 THEN 40
    WHEN "talent_program_sessions" <= 50 THEN 50
    ELSE 60
  END,
  "house_bucket_size" = CASE
    WHEN "house_programs" <= 5 THEN 5
    WHEN "house_programs" <= 10 THEN 10
    ELSE 15
  END,
  "slot_unit_amount_cents" = 3000;--> statement-breakpoint

UPDATE "platform_subscription_revisions" SET
  "term" = CASE WHEN "cadence" = 'annual' THEN 'annual'::platform_subscription_term ELSE 'month_to_month'::platform_subscription_term END,
  "talent_bucket_size" = CASE
    WHEN "talent_program_sessions" <= 10 THEN 10
    WHEN "talent_program_sessions" <= 20 THEN 20
    WHEN "talent_program_sessions" <= 30 THEN 30
    WHEN "talent_program_sessions" <= 40 THEN 40
    WHEN "talent_program_sessions" <= 50 THEN 50
    ELSE 60
  END,
  "house_bucket_size" = CASE
    WHEN "house_programs" <= 5 THEN 5
    WHEN "house_programs" <= 10 THEN 10
    ELSE 15
  END,
  "slot_unit_amount_cents" = 3000;--> statement-breakpoint

ALTER TABLE "platform_subscriptions"
  ALTER COLUMN "term" SET DEFAULT 'month_to_month',
  ALTER COLUMN "term" SET NOT NULL,
  ALTER COLUMN "talent_bucket_size" SET DEFAULT 10,
  ALTER COLUMN "talent_bucket_size" SET NOT NULL,
  ALTER COLUMN "house_bucket_size" SET DEFAULT 5,
  ALTER COLUMN "house_bucket_size" SET NOT NULL,
  ALTER COLUMN "slot_unit_amount_cents" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "platform_subscription_revisions"
  ALTER COLUMN "term" SET NOT NULL,
  ALTER COLUMN "talent_bucket_size" SET NOT NULL,
  ALTER COLUMN "house_bucket_size" SET NOT NULL,
  ALTER COLUMN "slot_unit_amount_cents" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "platform_subscriptions"
  DROP CONSTRAINT "platform_subscriptions_program_counts_nonnegative",
  DROP CONSTRAINT "platform_subscriptions_unit_amounts_nonnegative",
  DROP CONSTRAINT "platform_subscriptions_allowance_nonnegative",
  DROP CONSTRAINT "platform_subscriptions_commitment_complete",
  DROP CONSTRAINT "platform_subscriptions_commitment_length_valid",
  DROP CONSTRAINT "platform_subscriptions_commitment_pricing_valid";--> statement-breakpoint

ALTER TABLE "platform_subscription_revisions"
  DROP CONSTRAINT "platform_subscription_revisions_values_valid",
  DROP CONSTRAINT "platform_subscription_revisions_commitment_complete",
  DROP CONSTRAINT "platform_subscription_revisions_commitment_length_valid",
  DROP CONSTRAINT "platform_subscription_revisions_commitment_pricing_valid";--> statement-breakpoint

ALTER TABLE "platform_subscriptions"
  ADD CONSTRAINT "platform_subscriptions_talent_bucket_valid" CHECK ("talent_bucket_size" IN (10, 20, 30, 40, 50, 60)),
  ADD CONSTRAINT "platform_subscriptions_house_bucket_valid" CHECK ("house_bucket_size" IN (5, 10, 15)),
  ADD CONSTRAINT "platform_subscriptions_slot_rate_fixed" CHECK ("slot_unit_amount_cents" = 3000);--> statement-breakpoint

ALTER TABLE "platform_subscription_revisions"
  ADD CONSTRAINT "platform_subscription_revisions_talent_bucket_valid" CHECK ("talent_bucket_size" IN (10, 20, 30, 40, 50, 60)),
  ADD CONSTRAINT "platform_subscription_revisions_house_bucket_valid" CHECK ("house_bucket_size" IN (5, 10, 15)),
  ADD CONSTRAINT "platform_subscription_revisions_slot_rate_fixed" CHECK ("slot_unit_amount_cents" = 3000);--> statement-breakpoint

DROP TABLE "platform_subscription_clawbacks";--> statement-breakpoint

ALTER TABLE "platform_usage_snapshots"
  DROP CONSTRAINT "platform_usage_snapshots_counts_nonnegative",
  DROP COLUMN "one_offs",
  ADD CONSTRAINT "platform_usage_snapshots_counts_nonnegative" CHECK ("talent_sessions" >= 0 AND "house_programs" >= 0);--> statement-breakpoint

DELETE FROM "platform_overage_events" WHERE "metric" = 'one_offs';--> statement-breakpoint
ALTER TABLE "platform_overage_events" ALTER COLUMN "metric" TYPE text USING "metric"::text;--> statement-breakpoint
DROP TYPE "public"."platform_usage_metric";--> statement-breakpoint
CREATE TYPE "public"."platform_usage_metric" AS ENUM('talent_sessions', 'house_programs');--> statement-breakpoint
ALTER TABLE "platform_overage_events" ALTER COLUMN "metric" TYPE "platform_usage_metric" USING "metric"::platform_usage_metric;--> statement-breakpoint

ALTER TABLE "platform_subscriptions"
  DROP COLUMN "cadence",
  DROP COLUMN "commitment_tier",
  DROP COLUMN "commitment_started_at",
  DROP COLUMN "commitment_length_months",
  DROP COLUMN "talent_program_sessions",
  DROP COLUMN "talent_session_unit_amount_cents",
  DROP COLUMN "house_programs",
  DROP COLUMN "house_program_unit_amount_cents",
  DROP COLUMN "one_off_allowance",
  DROP COLUMN "unit_amount_cents";--> statement-breakpoint

ALTER TABLE "platform_subscription_revisions"
  DROP COLUMN "cadence",
  DROP COLUMN "commitment_tier",
  DROP COLUMN "commitment_started_at",
  DROP COLUMN "commitment_length_months",
  DROP COLUMN "talent_program_sessions",
  DROP COLUMN "talent_session_unit_amount_cents",
  DROP COLUMN "house_programs",
  DROP COLUMN "house_program_unit_amount_cents",
  DROP COLUMN "one_off_allowance",
  DROP COLUMN "unit_amount_cents";--> statement-breakpoint

DROP TYPE "public"."platform_billing_cadence";--> statement-breakpoint
DROP TYPE "public"."platform_clawback_status";--> statement-breakpoint
DROP TYPE "public"."platform_commitment_tier";--> statement-breakpoint

ALTER TABLE "residencies"
  DROP CONSTRAINT "residencies_comped_not_founding",
  DROP CONSTRAINT "residencies_founding_client_window_complete",
  DROP CONSTRAINT "residencies_founding_client_eligible",
  DROP CONSTRAINT "residencies_founding_client_dates_valid",
  DROP COLUMN "founding_client_signed_at",
  DROP COLUMN "founding_client_ends_at";--> statement-breakpoint

CREATE TABLE "platform_subscription_refunds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "platform_subscription_id" uuid NOT NULL,
  "residency_id" uuid NOT NULL,
  "source_revision" integer NOT NULL,
  "changed_at" timestamp with time zone NOT NULL,
  "total_annual_payment_cents" integer NOT NULL,
  "full_monthly_amount_cents" integer NOT NULL,
  "months_used" integer NOT NULL,
  "refund_amount_cents" integer NOT NULL,
  "status" "platform_refund_status" DEFAULT 'pending' NOT NULL,
  "stripe_refund_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "platform_subscription_refunds_source_revision_positive" CHECK ("source_revision" > 0),
  CONSTRAINT "platform_subscription_refunds_values_valid" CHECK (
    "total_annual_payment_cents" >= 0
    AND "full_monthly_amount_cents" > 0
    AND "months_used" BETWEEN 1 AND 12
    AND "refund_amount_cents" >= 0
    AND "refund_amount_cents" = GREATEST(0, "total_annual_payment_cents" - ("months_used" * "full_monthly_amount_cents"))
  )
);--> statement-breakpoint

ALTER TABLE "platform_subscription_refunds"
  ADD CONSTRAINT "platform_subscription_refunds_platform_subscription_id_platform_subscriptions_id_fk"
  FOREIGN KEY ("platform_subscription_id") REFERENCES "public"."platform_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscription_refunds"
  ADD CONSTRAINT "platform_subscription_refunds_residency_id_residencies_id_fk"
  FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "platform_subscription_refunds_pending_idx"
  ON "platform_subscription_refunds" USING btree ("platform_subscription_id", "status", "created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_subscription_refunds_source_unique"
  ON "platform_subscription_refunds" USING btree ("platform_subscription_id", "source_revision");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_subscription_refunds_stripe_refund_unique"
  ON "platform_subscription_refunds" USING btree ("stripe_refund_id")
  WHERE "stripe_refund_id" IS NOT NULL;--> statement-breakpoint

CREATE TRIGGER "platform_subscription_refunds_validate_scope"
  BEFORE INSERT OR UPDATE OF "platform_subscription_id", "residency_id"
  ON "platform_subscription_refunds"
  FOR EACH ROW EXECUTE FUNCTION validate_platform_billing_child_scope();--> statement-breakpoint

ALTER TABLE "platform_subscription_refunds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "platform_subscription_refunds" FROM anon, authenticated;
