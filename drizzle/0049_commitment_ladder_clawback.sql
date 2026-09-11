CREATE TYPE "public"."platform_commitment_tier" AS ENUM('month_to_month', 'three_month', 'six_month', 'twelve_month');--> statement-breakpoint
CREATE TYPE "public"."platform_clawback_status" AS ENUM('pending', 'queued', 'applied', 'void');--> statement-breakpoint

ALTER TABLE "platform_subscriptions"
  ADD COLUMN "commitment_tier" "platform_commitment_tier";--> statement-breakpoint
ALTER TABLE "platform_subscriptions"
  ADD COLUMN "commitment_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_subscriptions"
  ADD COLUMN "commitment_length_months" integer;--> statement-breakpoint

ALTER TABLE "platform_subscription_revisions"
  ADD COLUMN "commitment_tier" "platform_commitment_tier";--> statement-breakpoint
ALTER TABLE "platform_subscription_revisions"
  ADD COLUMN "commitment_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_subscription_revisions"
  ADD COLUMN "commitment_length_months" integer;--> statement-breakpoint

ALTER TABLE "platform_subscriptions"
  ADD CONSTRAINT "platform_subscriptions_commitment_complete" CHECK (
    ("commitment_tier" IS NULL AND "commitment_started_at" IS NULL AND "commitment_length_months" IS NULL)
    OR
    ("commitment_tier" IS NOT NULL AND "commitment_started_at" IS NOT NULL AND "commitment_length_months" IS NOT NULL)
  );--> statement-breakpoint
ALTER TABLE "platform_subscriptions"
  ADD CONSTRAINT "platform_subscriptions_commitment_length_valid" CHECK (
    "commitment_tier" IS NULL
    OR ("commitment_tier" = 'month_to_month' AND "commitment_length_months" = 1)
    OR ("commitment_tier" = 'three_month' AND "commitment_length_months" = 3)
    OR ("commitment_tier" = 'six_month' AND "commitment_length_months" = 6)
    OR ("commitment_tier" = 'twelve_month' AND "commitment_length_months" = 12)
  );--> statement-breakpoint
ALTER TABLE "platform_subscriptions"
  ADD CONSTRAINT "platform_subscriptions_commitment_pricing_valid" CHECK (
    "commitment_tier" IS NULL
    OR (
      "cadence" = 'monthly'
      AND "house_program_unit_amount_cents" = 6000
      AND (
        ("commitment_tier" = 'month_to_month' AND "talent_session_unit_amount_cents" = 9000)
        OR ("commitment_tier" = 'three_month' AND "talent_session_unit_amount_cents" = 8000)
        OR ("commitment_tier" = 'six_month' AND "talent_session_unit_amount_cents" = 7000)
        OR ("commitment_tier" = 'twelve_month' AND "talent_session_unit_amount_cents" = 6000)
      )
    )
  );--> statement-breakpoint
ALTER TABLE "platform_subscription_revisions"
  ADD CONSTRAINT "platform_subscription_revisions_commitment_complete" CHECK (
    ("commitment_tier" IS NULL AND "commitment_started_at" IS NULL AND "commitment_length_months" IS NULL)
    OR
    ("commitment_tier" IS NOT NULL AND "commitment_started_at" IS NOT NULL AND "commitment_length_months" IS NOT NULL)
  );--> statement-breakpoint
ALTER TABLE "platform_subscription_revisions"
  ADD CONSTRAINT "platform_subscription_revisions_commitment_length_valid" CHECK (
    "commitment_tier" IS NULL
    OR ("commitment_tier" = 'month_to_month' AND "commitment_length_months" = 1)
    OR ("commitment_tier" = 'three_month' AND "commitment_length_months" = 3)
    OR ("commitment_tier" = 'six_month' AND "commitment_length_months" = 6)
    OR ("commitment_tier" = 'twelve_month' AND "commitment_length_months" = 12)
  );--> statement-breakpoint
ALTER TABLE "platform_subscription_revisions"
  ADD CONSTRAINT "platform_subscription_revisions_commitment_pricing_valid" CHECK (
    "commitment_tier" IS NULL
    OR (
      "cadence" = 'monthly'
      AND "house_program_unit_amount_cents" = 6000
      AND (
        ("commitment_tier" = 'month_to_month' AND "talent_session_unit_amount_cents" = 9000)
        OR ("commitment_tier" = 'three_month' AND "talent_session_unit_amount_cents" = 8000)
        OR ("commitment_tier" = 'six_month' AND "talent_session_unit_amount_cents" = 7000)
        OR ("commitment_tier" = 'twelve_month' AND "talent_session_unit_amount_cents" = 6000)
      )
    )
  );--> statement-breakpoint

CREATE TABLE "platform_subscription_clawbacks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "platform_subscription_id" uuid NOT NULL,
  "residency_id" uuid NOT NULL,
  "source_revision" integer NOT NULL,
  "source_commitment_tier" "platform_commitment_tier" NOT NULL,
  "source_commitment_started_at" timestamp with time zone NOT NULL,
  "target_commitment_tier" "platform_commitment_tier",
  "changed_at" timestamp with time zone NOT NULL,
  "talent_sessions_billed" integer NOT NULL,
  "unit_amount_cents" integer NOT NULL,
  "amount_cents" integer NOT NULL,
  "status" "platform_clawback_status" DEFAULT 'pending' NOT NULL,
  "stripe_invoice_item_id" text,
  "applied_invoice_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "platform_subscription_clawbacks_source_revision_positive" CHECK ("source_revision" > 0),
  CONSTRAINT "platform_subscription_clawbacks_source_committed" CHECK ("source_commitment_tier" IN ('three_month', 'six_month', 'twelve_month')),
  CONSTRAINT "platform_subscription_clawbacks_target_changed" CHECK ("target_commitment_tier" IS DISTINCT FROM "source_commitment_tier"),
  CONSTRAINT "platform_subscription_clawbacks_unit_amount_valid" CHECK (
    ("source_commitment_tier" = 'three_month' AND "unit_amount_cents" = 1000)
    OR ("source_commitment_tier" = 'six_month' AND "unit_amount_cents" = 2000)
    OR ("source_commitment_tier" = 'twelve_month' AND "unit_amount_cents" = 3000)
  ),
  CONSTRAINT "platform_subscription_clawbacks_amount_valid" CHECK (
    "talent_sessions_billed" > 0
    AND "unit_amount_cents" > 0
    AND "amount_cents" = "talent_sessions_billed" * "unit_amount_cents"
  )
);--> statement-breakpoint

ALTER TABLE "platform_subscription_clawbacks"
  ADD CONSTRAINT "platform_subscription_clawbacks_platform_subscription_id_platform_subscriptions_id_fk"
  FOREIGN KEY ("platform_subscription_id") REFERENCES "public"."platform_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscription_clawbacks"
  ADD CONSTRAINT "platform_subscription_clawbacks_residency_id_residencies_id_fk"
  FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscription_clawbacks"
  ADD CONSTRAINT "platform_subscription_clawbacks_applied_invoice_id_platform_subscription_invoices_id_fk"
  FOREIGN KEY ("applied_invoice_id") REFERENCES "public"."platform_subscription_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "platform_subscription_clawbacks_pending_idx"
  ON "platform_subscription_clawbacks" USING btree ("platform_subscription_id", "status", "created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_subscription_clawbacks_stripe_item_unique"
  ON "platform_subscription_clawbacks" USING btree ("stripe_invoice_item_id")
  WHERE "stripe_invoice_item_id" IS NOT NULL;--> statement-breakpoint

CREATE TRIGGER "platform_subscription_clawbacks_validate_scope"
  BEFORE INSERT OR UPDATE OF "platform_subscription_id", "residency_id"
  ON "platform_subscription_clawbacks"
  FOR EACH ROW EXECUTE FUNCTION validate_platform_billing_child_scope();--> statement-breakpoint

ALTER TABLE "platform_subscription_clawbacks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "platform_subscription_clawbacks" FROM anon, authenticated;
