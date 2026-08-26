CREATE TYPE "public"."attention_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."automation_status" AS ENUM('running', 'succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."billing_status" AS ENUM('pending', 'reviewed', 'invoiced', 'not_billable');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('open', 'offered', 'pending_hfy_confirmation', 'confirmed', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."compensation_type" AS ENUM('hourly', 'fixed', 'na');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."invoice_line_type" AS ENUM('program_base_fee', 'overage', 'trial_add_on', 'talent_hours', 'talent_fixed_fee', 'manual_adjustment', 'special_event');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'approved', 'sent', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('not_ready', 'ready_to_pay', 'paid', 'na');--> statement-breakpoint
CREATE TYPE "public"."roster_status" AS ENUM('needs_review', 'ready');--> statement-breakpoint
CREATE TYPE "public"."service_tier" AS ENUM('operations_only', 'complete');--> statement-breakpoint
CREATE TYPE "public"."talent_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('internal_admin', 'hotel_user');--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"talent_id" uuid,
	"created_by_user_id" uuid,
	"source" text DEFAULT 'internal' NOT NULL,
	"set_name" text NOT NULL,
	"guest_name" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'DJ' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"booking_status" "booking_status" DEFAULT 'open' NOT NULL,
	"compensation_type" "compensation_type" DEFAULT 'hourly' NOT NULL,
	"talent_rate_cents" integer DEFAULT 0 NOT NULL,
	"fixed_fee_cents" integer,
	"total_compensation_cents" integer DEFAULT 0 NOT NULL,
	"payout_status" "payout_status" DEFAULT 'not_ready' NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_amount_cents" integer,
	"payment_reference" text,
	"internal_notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignments_time_valid" CHECK ("assignments"."ends_at" > "assignments"."starts_at"),
	CONSTRAINT "assignments_money_nonnegative" CHECK ("assignments"."talent_rate_cents" >= 0 AND "assignments"."total_compensation_cents" >= 0 AND ("assignments"."fixed_fee_cents" IS NULL OR "assignments"."fixed_fee_cents" >= 0) AND ("assignments"."paid_amount_cents" IS NULL OR "assignments"."paid_amount_cents" >= 0)),
	CONSTRAINT "assignments_na_payout_consistent" CHECK ("assignments"."compensation_type" <> 'na' OR ("assignments"."payout_status" = 'na' AND "assignments"."total_compensation_cents" = 0)),
	CONSTRAINT "assignments_paid_complete" CHECK ("assignments"."payout_status" <> 'paid' OR ("assignments"."paid_at" IS NOT NULL AND "assignments"."paid_amount_cents" IS NOT NULL AND "assignments"."payment_reference" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "attention_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"residency_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"code" text NOT NULL,
	"message" text NOT NULL,
	"status" "attention_status" DEFAULT 'open' NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"residency_id" uuid,
	"actor_user_id" uuid,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"residency_id" uuid NOT NULL,
	"automation_name" text NOT NULL,
	"scheduled_key" text NOT NULL,
	"status" "automation_status" DEFAULT 'running' NOT NULL,
	"processed_count" integer DEFAULT 0 NOT NULL,
	"changed_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "client_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"internal_notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"invoice_version" integer NOT NULL,
	"recipient" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider_message_id" text,
	"status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invoice_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"source_shift_id" uuid,
	"type" "invoice_line_type" NOT NULL,
	"description" text NOT NULL,
	"quantity_thousandths" integer DEFAULT 1000 NOT NULL,
	"unit_amount_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"adjustment_reason" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_line_items_quantity_positive" CHECK ("invoice_line_items"."quantity_thousandths" > 0),
	CONSTRAINT "invoice_line_items_adjustment_reason" CHECK ("invoice_line_items"."type" <> 'manual_adjustment' OR "invoice_line_items"."adjustment_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"residency_id" uuid NOT NULL,
	"invoice_number" text NOT NULL,
	"billing_period_start" date NOT NULL,
	"billing_period_end" date NOT NULL,
	"invoice_date" date NOT NULL,
	"payment_terms_days" integer NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"pdf_storage_path" text,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_period_valid" CHECK ("invoices"."billing_period_end" >= "invoices"."billing_period_start"),
	CONSTRAINT "invoices_terms_valid" CHECK ("invoices"."payment_terms_days" >= 0 AND "invoices"."payment_terms_days" <= 365),
	CONSTRAINT "invoices_total_nonnegative" CHECK ("invoices"."total_cents" >= 0),
	CONSTRAINT "invoices_version_positive" CHECK ("invoices"."version" > 0),
	CONSTRAINT "invoices_approved_has_pdf" CHECK ("invoices"."status" NOT IN ('approved', 'sent', 'paid') OR "invoices"."pdf_storage_path" IS NOT NULL),
	CONSTRAINT "invoices_paid_has_date" CHECK ("invoices"."status" <> 'paid' OR "invoices"."paid_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "residencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"city_state" text DEFAULT '' NOT NULL,
	"timezone" text DEFAULT 'America/Los_Angeles' NOT NULL,
	"tier" "service_tier" DEFAULT 'operations_only' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"default_talent_rate_cents" integer DEFAULT 0 NOT NULL,
	"client_hourly_rate_cents" integer DEFAULT 0 NOT NULL,
	"payment_terms_days" integer DEFAULT 7 NOT NULL,
	"invoice_frequency" text DEFAULT 'weekly' NOT NULL,
	"scheduling_pattern" text DEFAULT 'client_supplied' NOT NULL,
	"billing_contact_email" text DEFAULT '' NOT NULL,
	"billing_contact_name" text DEFAULT '' NOT NULL,
	"billing_address" text DEFAULT '' NOT NULL,
	"invoice_prefix" text NOT NULL,
	"auto_send_invoices" boolean DEFAULT false NOT NULL,
	"auto_send_reason" text DEFAULT '' NOT NULL,
	"internal_notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "residencies_rates_nonnegative" CHECK ("residencies"."default_talent_rate_cents" >= 0 AND "residencies"."client_hourly_rate_cents" >= 0),
	CONSTRAINT "residencies_payment_terms_valid" CHECK ("residencies"."payment_terms_days" >= 0 AND "residencies"."payment_terms_days" <= 365)
);
--> statement-breakpoint
CREATE TABLE "residency_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"residency_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "residency_talent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"residency_id" uuid NOT NULL,
	"talent_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"approved_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"residency_id" uuid NOT NULL,
	"invoice_id" uuid,
	"name" text NOT NULL,
	"service_date" date NOT NULL,
	"room" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"client_rate_cents" integer NOT NULL,
	"billing_status" "billing_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shifts_time_valid" CHECK ("shifts"."ends_at" > "shifts"."starts_at"),
	CONSTRAINT "shifts_client_rate_nonnegative" CHECK ("shifts"."client_rate_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "talent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage_name" text NOT NULL,
	"full_name" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"instagram_handle" text DEFAULT '' NOT NULL,
	"roster_status" "roster_status" DEFAULT 'needs_review' NOT NULL,
	"talent_status" "talent_status" DEFAULT 'active' NOT NULL,
	"home_market" text DEFAULT '' NOT NULL,
	"genres" text[] DEFAULT '{}'::text[] NOT NULL,
	"priority" integer,
	"talent_notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "talent_priority_range" CHECK ("talent"."priority" IS NULL OR ("talent"."priority" >= 1 AND "talent"."priority" <= 5))
);
--> statement-breakpoint
CREATE TABLE "talent_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"talent_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"storage_path" text NOT NULL,
	"content_type" text NOT NULL,
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "talent_onboarding_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage_name" text NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"instagram_handle" text DEFAULT '' NOT NULL,
	"home_market" text DEFAULT '' NOT NULL,
	"genres" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" "roster_status" DEFAULT 'needs_review' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "talent_payment_profiles" (
	"talent_id" uuid PRIMARY KEY NOT NULL,
	"payment_method" text DEFAULT '' NOT NULL,
	"zelle_email" text DEFAULT '' NOT NULL,
	"zelle_phone" text DEFAULT '' NOT NULL,
	"ach_account_name_encrypted" text DEFAULT '' NOT NULL,
	"ach_routing_number_encrypted" text DEFAULT '' NOT NULL,
	"ach_account_number_encrypted" text DEFAULT '' NOT NULL,
	"last_four" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"role" "user_role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attention_items" ADD CONSTRAINT "attention_items_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_deliveries" ADD CONSTRAINT "invoice_deliveries_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_source_shift_id_shifts_id_fk" FOREIGN KEY ("source_shift_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residencies" ADD CONSTRAINT "residencies_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residency_memberships" ADD CONSTRAINT "residency_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residency_memberships" ADD CONSTRAINT "residency_memberships_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residency_talent" ADD CONSTRAINT "residency_talent_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residency_talent" ADD CONSTRAINT "residency_talent_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residency_talent" ADD CONSTRAINT "residency_talent_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_documents" ADD CONSTRAINT "talent_documents_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_documents" ADD CONSTRAINT "talent_documents_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_onboarding_submissions" ADD CONSTRAINT "talent_onboarding_submissions_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_payment_profiles" ADD CONSTRAINT "talent_payment_profiles_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignments_shift_idx" ON "assignments" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "assignments_talent_time_idx" ON "assignments" USING btree ("talent_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "assignments_booking_payout_idx" ON "assignments" USING btree ("booking_status","payout_status");--> statement-breakpoint
CREATE INDEX "attention_items_residency_status_idx" ON "attention_items" USING btree ("residency_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "attention_items_open_code_unique" ON "attention_items" USING btree ("entity_type","entity_id","code") WHERE "attention_items"."status" = 'open';--> statement-breakpoint
CREATE INDEX "audit_log_residency_created_idx" ON "audit_log" USING btree ("residency_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_runs_schedule_unique" ON "automation_runs" USING btree ("residency_id","automation_name","scheduled_key");--> statement-breakpoint
CREATE INDEX "automation_runs_status_idx" ON "automation_runs" USING btree ("status","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_deliveries_invoice_version_unique" ON "invoice_deliveries" USING btree ("invoice_id","invoice_version");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_deliveries_idempotency_key_unique" ON "invoice_deliveries" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "invoice_line_items_invoice_idx" ON "invoice_line_items" USING btree ("invoice_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_residency_number_unique" ON "invoices" USING btree ("residency_id","invoice_number");--> statement-breakpoint
CREATE INDEX "invoices_residency_period_idx" ON "invoices" USING btree ("residency_id","billing_period_start","billing_period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "residencies_slug_unique" ON "residencies" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "residencies_invoice_prefix_unique" ON "residencies" USING btree ("invoice_prefix");--> statement-breakpoint
CREATE INDEX "residencies_client_account_idx" ON "residencies" USING btree ("client_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "residency_memberships_user_residency_unique" ON "residency_memberships" USING btree ("user_id","residency_id");--> statement-breakpoint
CREATE INDEX "residency_memberships_residency_idx" ON "residency_memberships" USING btree ("residency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "residency_talent_residency_talent_unique" ON "residency_talent" USING btree ("residency_id","talent_id");--> statement-breakpoint
CREATE INDEX "residency_talent_talent_idx" ON "residency_talent" USING btree ("talent_id");--> statement-breakpoint
CREATE INDEX "shifts_residency_date_idx" ON "shifts" USING btree ("residency_id","service_date");--> statement-breakpoint
CREATE UNIQUE INDEX "shifts_exact_slot_unique" ON "shifts" USING btree ("residency_id","room","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "talent_stage_name_idx" ON "talent" USING btree ("stage_name");--> statement-breakpoint
CREATE UNIQUE INDEX "talent_documents_storage_path_unique" ON "talent_documents" USING btree ("storage_path");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint

-- Cross-row constraints replacing Airtable audit formulas and match keys.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_id_residency_unique" UNIQUE ("id", "residency_id");--> statement-breakpoint

ALTER TABLE "shifts"
  ADD CONSTRAINT "shifts_invoice_same_residency_fk"
  FOREIGN KEY ("invoice_id", "residency_id")
  REFERENCES "invoices" ("id", "residency_id")
  ON DELETE RESTRICT;--> statement-breakpoint

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_no_overlapping_active_periods"
  EXCLUDE USING gist (
    "residency_id" WITH =,
    daterange("billing_period_start", "billing_period_end", '[]') WITH &&
  ) WHERE ("status" <> 'void');--> statement-breakpoint

ALTER TABLE "assignments"
  ADD CONSTRAINT "assignments_talent_no_active_overlap"
  EXCLUDE USING gist (
    "talent_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  ) WHERE (
    "talent_id" IS NOT NULL
    AND "booking_status" IN ('pending_hfy_confirmation', 'offered', 'confirmed')
  );--> statement-breakpoint

CREATE FUNCTION validate_assignment_scope() RETURNS trigger AS $$
DECLARE
  parent_shift shifts%ROWTYPE;
BEGIN
  SELECT * INTO parent_shift FROM shifts WHERE id = NEW.shift_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment requires one valid Shift';
  END IF;

  IF NEW.starts_at < parent_shift.starts_at OR NEW.ends_at > parent_shift.ends_at THEN
    RAISE EXCEPTION 'Assignment time must stay within its Shift';
  END IF;

  IF NEW.source = 'hotel' THEN
    IF NEW.booking_status <> 'pending_hfy_confirmation' THEN
      RAISE EXCEPTION 'Hotel selections must be Pending HFY Confirmation';
    END IF;
    IF NEW.talent_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM residency_talent rt
      JOIN talent t ON t.id = rt.talent_id
      WHERE rt.residency_id = parent_shift.residency_id
        AND rt.talent_id = NEW.talent_id
        AND rt.active = true
        AND t.talent_status = 'active'
    ) THEN
      RAISE EXCEPTION 'Hotel selection requires an active Residency-approved DJ';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER "assignments_validate_scope"
  BEFORE INSERT OR UPDATE OF "shift_id", "talent_id", "source", "booking_status", "starts_at", "ends_at"
  ON "assignments"
  FOR EACH ROW EXECUTE FUNCTION validate_assignment_scope();
