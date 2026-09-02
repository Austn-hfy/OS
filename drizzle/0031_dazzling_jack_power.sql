CREATE TYPE "public"."platform_billing_cadence" AS ENUM('monthly', 'quarterly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."platform_subscription_invoice_status" AS ENUM('open', 'paid', 'void', 'uncollectible');--> statement-breakpoint
CREATE TYPE "public"."platform_subscription_status" AS ENUM('incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."talent_invoice_adjustment_status" AS ENUM('pending', 'applied', 'void');--> statement-breakpoint
ALTER TYPE "public"."billing_status" ADD VALUE 'pending_adjustment' BEFORE 'not_billable';--> statement-breakpoint
CREATE TABLE "platform_subscription_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform_subscription_id" uuid NOT NULL,
	"residency_id" uuid NOT NULL,
	"stripe_invoice_id" text NOT NULL,
	"billing_period_start" date NOT NULL,
	"billing_period_end" date NOT NULL,
	"invoice_date" date NOT NULL,
	"amount_due_cents" integer NOT NULL,
	"amount_paid_cents" integer DEFAULT 0 NOT NULL,
	"status" "platform_subscription_invoice_status" DEFAULT 'open' NOT NULL,
	"hosted_invoice_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_subscription_invoices_period_valid" CHECK ("platform_subscription_invoices"."billing_period_end" >= "platform_subscription_invoices"."billing_period_start"),
	CONSTRAINT "platform_subscription_invoices_amounts_nonnegative" CHECK ("platform_subscription_invoices"."amount_due_cents" >= 0 AND "platform_subscription_invoices"."amount_paid_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "platform_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"residency_id" uuid NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" "platform_subscription_status" DEFAULT 'incomplete' NOT NULL,
	"cadence" "platform_billing_cadence" DEFAULT 'monthly' NOT NULL,
	"talent_program_sessions" integer DEFAULT 0 NOT NULL,
	"talent_session_unit_amount_cents" integer DEFAULT 0 NOT NULL,
	"house_programs" integer DEFAULT 0 NOT NULL,
	"house_program_unit_amount_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"card_brand" text DEFAULT '' NOT NULL,
	"card_last4" text DEFAULT '' NOT NULL,
	"next_charge_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_subscriptions_program_counts_nonnegative" CHECK ("platform_subscriptions"."talent_program_sessions" >= 0 AND "platform_subscriptions"."house_programs" >= 0),
	CONSTRAINT "platform_subscriptions_unit_amounts_nonnegative" CHECK ("platform_subscriptions"."talent_session_unit_amount_cents" >= 0 AND "platform_subscriptions"."house_program_unit_amount_cents" >= 0),
	CONSTRAINT "platform_subscriptions_currency_valid" CHECK ("platform_subscriptions"."currency" = 'USD'),
	CONSTRAINT "platform_subscriptions_card_complete" CHECK (("platform_subscriptions"."card_brand" = '' AND "platform_subscriptions"."card_last4" = '') OR ("platform_subscriptions"."card_brand" <> '' AND "platform_subscriptions"."card_last4" ~ '^[0-9]{4}$'))
);
--> statement-breakpoint
CREATE TABLE "talent_invoice_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"residency_id" uuid NOT NULL,
	"source_invoice_id" uuid NOT NULL,
	"source_shift_id" uuid,
	"applied_invoice_id" uuid,
	"service_date" date NOT NULL,
	"reason" text NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" "talent_invoice_adjustment_status" DEFAULT 'pending' NOT NULL,
	"created_by_user_id" uuid,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "talent_invoice_adjustments_amount_nonzero" CHECK ("talent_invoice_adjustments"."amount_cents" <> 0),
	CONSTRAINT "talent_invoice_adjustments_application_valid" CHECK (
    ("talent_invoice_adjustments"."status" = 'applied' AND "talent_invoice_adjustments"."applied_invoice_id" IS NOT NULL AND "talent_invoice_adjustments"."applied_at" IS NOT NULL)
    OR
    ("talent_invoice_adjustments"."status" <> 'applied' AND "talent_invoice_adjustments"."applied_invoice_id" IS NULL AND "talent_invoice_adjustments"."applied_at" IS NULL)
  )
);
--> statement-breakpoint
CREATE TABLE "talent_schedule_locks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"residency_id" uuid NOT NULL,
	"service_month" date NOT NULL,
	"billing_period_start" date NOT NULL,
	"billing_period_end" date NOT NULL,
	"invoice_id" uuid NOT NULL,
	"locked_by_user_id" uuid,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "talent_schedule_locks_month_valid" CHECK ("talent_schedule_locks"."service_month" = date_trunc('month', "talent_schedule_locks"."service_month"::timestamp)::date),
	CONSTRAINT "talent_schedule_locks_period_valid" CHECK ("talent_schedule_locks"."billing_period_start" = "talent_schedule_locks"."service_month" AND "talent_schedule_locks"."billing_period_end" = ("talent_schedule_locks"."service_month" + interval '1 month - 1 day')::date)
);
--> statement-breakpoint
ALTER TABLE "platform_subscription_invoices" ADD CONSTRAINT "platform_subscription_invoices_platform_subscription_id_platform_subscriptions_id_fk" FOREIGN KEY ("platform_subscription_id") REFERENCES "public"."platform_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscription_invoices" ADD CONSTRAINT "platform_subscription_invoices_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_invoice_adjustments" ADD CONSTRAINT "talent_invoice_adjustments_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_invoice_adjustments" ADD CONSTRAINT "talent_invoice_adjustments_source_invoice_id_invoices_id_fk" FOREIGN KEY ("source_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_invoice_adjustments" ADD CONSTRAINT "talent_invoice_adjustments_source_shift_id_shifts_id_fk" FOREIGN KEY ("source_shift_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_invoice_adjustments" ADD CONSTRAINT "talent_invoice_adjustments_applied_invoice_id_invoices_id_fk" FOREIGN KEY ("applied_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_invoice_adjustments" ADD CONSTRAINT "talent_invoice_adjustments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_schedule_locks" ADD CONSTRAINT "talent_schedule_locks_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_schedule_locks" ADD CONSTRAINT "talent_schedule_locks_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_schedule_locks" ADD CONSTRAINT "talent_schedule_locks_locked_by_user_id_users_id_fk" FOREIGN KEY ("locked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_subscription_invoices_stripe_invoice_unique" ON "platform_subscription_invoices" USING btree ("stripe_invoice_id");--> statement-breakpoint
CREATE INDEX "platform_subscription_invoices_residency_period_idx" ON "platform_subscription_invoices" USING btree ("residency_id","billing_period_start","billing_period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_subscriptions_residency_unique" ON "platform_subscriptions" USING btree ("residency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_subscriptions_stripe_subscription_unique" ON "platform_subscriptions" USING btree ("stripe_subscription_id") WHERE "platform_subscriptions"."stripe_subscription_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "talent_invoice_adjustments_pending_idx" ON "talent_invoice_adjustments" USING btree ("residency_id","status","created_at");--> statement-breakpoint
CREATE INDEX "talent_invoice_adjustments_source_invoice_idx" ON "talent_invoice_adjustments" USING btree ("source_invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "talent_schedule_locks_residency_month_unique" ON "talent_schedule_locks" USING btree ("residency_id","service_month");--> statement-breakpoint
CREATE UNIQUE INDEX "talent_schedule_locks_invoice_unique" ON "talent_schedule_locks" USING btree ("invoice_id");--> statement-breakpoint

-- Financial records are server-only. Clients reach them through scoped server
-- pages and actions; no browser role receives direct table access.
ALTER TABLE "platform_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "platform_subscription_invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "talent_schedule_locks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "talent_invoice_adjustments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "platform_subscriptions", "platform_subscription_invoices", "talent_schedule_locks", "talent_invoice_adjustments" FROM anon, authenticated;--> statement-breakpoint

CREATE OR REPLACE FUNCTION validate_platform_subscription_invoice_scope() RETURNS trigger AS $$
DECLARE
  parent_subscription platform_subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO parent_subscription FROM platform_subscriptions WHERE id = NEW.platform_subscription_id;
  IF NOT FOUND OR parent_subscription.residency_id <> NEW.residency_id THEN
    RAISE EXCEPTION 'Platform invoice must match its subscription Residency';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER "platform_subscription_invoices_validate_scope"
  BEFORE INSERT OR UPDATE OF "platform_subscription_id", "residency_id"
  ON "platform_subscription_invoices"
  FOR EACH ROW EXECUTE FUNCTION validate_platform_subscription_invoice_scope();--> statement-breakpoint

CREATE OR REPLACE FUNCTION validate_talent_invoice_adjustment_scope() RETURNS trigger AS $$
DECLARE
  source_invoice invoices%ROWTYPE;
  applied_invoice invoices%ROWTYPE;
BEGIN
  SELECT * INTO source_invoice FROM invoices WHERE id = NEW.source_invoice_id;
  IF NOT FOUND OR source_invoice.residency_id <> NEW.residency_id OR source_invoice.status IN ('draft', 'void') THEN
    RAISE EXCEPTION 'Talent adjustment requires a finalized source Invoice for the same Residency';
  END IF;
  IF NEW.applied_invoice_id IS NOT NULL THEN
    SELECT * INTO applied_invoice FROM invoices WHERE id = NEW.applied_invoice_id;
    IF NOT FOUND OR applied_invoice.residency_id <> NEW.residency_id
      OR applied_invoice.id = source_invoice.id
      OR applied_invoice.invoice_date <= source_invoice.invoice_date THEN
      RAISE EXCEPTION 'Applied talent adjustment requires a later Invoice for the same Residency';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER "talent_invoice_adjustments_validate_scope"
  BEFORE INSERT OR UPDATE OF "residency_id", "source_invoice_id", "applied_invoice_id", "status"
  ON "talent_invoice_adjustments"
  FOR EACH ROW EXECUTE FUNCTION validate_talent_invoice_adjustment_scope();--> statement-breakpoint

CREATE OR REPLACE FUNCTION validate_talent_schedule_lock_scope() RETURNS trigger AS $$
DECLARE
  talent_invoice invoices%ROWTYPE;
BEGIN
  SELECT * INTO talent_invoice FROM invoices WHERE id = NEW.invoice_id;
  IF NOT FOUND OR talent_invoice.residency_id <> NEW.residency_id
    OR talent_invoice.kind <> 'scheduled_period'
    OR talent_invoice.billing_period_start <> NEW.billing_period_start
    OR talent_invoice.billing_period_end <> NEW.billing_period_end THEN
    RAISE EXCEPTION 'Talent schedule lock must match its monthly Invoice';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER "talent_schedule_locks_validate_scope"
  BEFORE INSERT OR UPDATE OF "residency_id", "invoice_id", "billing_period_start", "billing_period_end"
  ON "talent_schedule_locks"
  FOR EACH ROW EXECUTE FUNCTION validate_talent_schedule_lock_scope();
