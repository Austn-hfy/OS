CREATE TYPE "public"."hfy_talent_request_status" AS ENUM('pending', 'fulfilled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."shift_economics_mode" AS ENUM('hfy', 'client_owned', 'hfy_request');--> statement-breakpoint
CREATE TYPE "public"."talent_ownership" AS ENUM('hfy', 'residency');--> statement-breakpoint
CREATE TABLE "client_assignment_terms" (
	"assignment_id" uuid PRIMARY KEY NOT NULL,
	"residency_id" uuid NOT NULL,
	"rate_cents" integer,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_assignment_terms_rate_nonnegative" CHECK ("client_assignment_terms"."rate_cents" IS NULL OR "client_assignment_terms"."rate_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "hfy_talent_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"residency_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"status" "hfy_talent_request_status" DEFAULT 'pending' NOT NULL,
	"fulfilled_assignment_id" uuid,
	"created_by_user_id" uuid,
	"fulfilled_by_user_id" uuid,
	"fulfilled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hfy_talent_requests_fulfillment_valid" CHECK (
    ("hfy_talent_requests"."status" = 'fulfilled' AND "hfy_talent_requests"."fulfilled_assignment_id" IS NOT NULL AND "hfy_talent_requests"."fulfilled_by_user_id" IS NOT NULL AND "hfy_talent_requests"."fulfilled_at" IS NOT NULL)
    OR
    ("hfy_talent_requests"."status" <> 'fulfilled' AND "hfy_talent_requests"."fulfilled_assignment_id" IS NULL AND "hfy_talent_requests"."fulfilled_by_user_id" IS NULL AND "hfy_talent_requests"."fulfilled_at" IS NULL)
  )
);
--> statement-breakpoint
ALTER TABLE "residencies" ADD COLUMN "client_payment_status_visible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "economics_mode" "shift_economics_mode" DEFAULT 'hfy' NOT NULL;--> statement-breakpoint
ALTER TABLE "talent" ADD COLUMN "client_contact" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "talent" ADD COLUMN "ownership" "talent_ownership" DEFAULT 'hfy' NOT NULL;--> statement-breakpoint
ALTER TABLE "talent" ADD COLUMN "owning_residency_id" uuid;--> statement-breakpoint
ALTER TABLE "client_assignment_terms" ADD CONSTRAINT "client_assignment_terms_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_assignment_terms" ADD CONSTRAINT "client_assignment_terms_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_assignment_terms" ADD CONSTRAINT "client_assignment_terms_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hfy_talent_requests" ADD CONSTRAINT "hfy_talent_requests_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hfy_talent_requests" ADD CONSTRAINT "hfy_talent_requests_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hfy_talent_requests" ADD CONSTRAINT "hfy_talent_requests_fulfilled_assignment_id_assignments_id_fk" FOREIGN KEY ("fulfilled_assignment_id") REFERENCES "public"."assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hfy_talent_requests" ADD CONSTRAINT "hfy_talent_requests_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hfy_talent_requests" ADD CONSTRAINT "hfy_talent_requests_fulfilled_by_user_id_users_id_fk" FOREIGN KEY ("fulfilled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_assignment_terms_residency_idx" ON "client_assignment_terms" USING btree ("residency_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hfy_talent_requests_shift_unique" ON "hfy_talent_requests" USING btree ("shift_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hfy_talent_requests_assignment_unique" ON "hfy_talent_requests" USING btree ("fulfilled_assignment_id") WHERE "hfy_talent_requests"."fulfilled_assignment_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "hfy_talent_requests_queue_idx" ON "hfy_talent_requests" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "talent" ADD CONSTRAINT "talent_owning_residency_id_residencies_id_fk" FOREIGN KEY ("owning_residency_id") REFERENCES "public"."residencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "talent_owning_residency_idx" ON "talent" USING btree ("owning_residency_id","archived_at");--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_economics_boundary" CHECK (
    "shifts"."economics_mode" = 'hfy'
    OR
    ("shifts"."invoice_id" IS NULL AND "shifts"."billing_status" = 'not_billable' AND "shifts"."client_rate_override_cents" IS NULL AND "shifts"."client_rate_cents" = 0)
  );--> statement-breakpoint
ALTER TABLE "talent" ADD CONSTRAINT "talent_ownership_valid" CHECK (
    ("talent"."ownership" = 'hfy' AND "talent"."owning_residency_id" IS NULL)
    OR
    ("talent"."ownership" = 'residency' AND "talent"."owning_residency_id" IS NOT NULL AND "talent"."exclusive_residency_id" = "talent"."owning_residency_id")
  );--> statement-breakpoint

-- These two ledgers are server-only. Residency users act through authenticated
-- server actions, which enforce the selected Residency and manager role.
ALTER TABLE "client_assignment_terms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hfy_talent_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "client_assignment_terms", "hfy_talent_requests" FROM anon, authenticated;--> statement-breakpoint

CREATE OR REPLACE FUNCTION validate_client_assignment_terms_scope() RETURNS trigger AS $$
DECLARE
  parent_assignment assignments%ROWTYPE;
  parent_shift shifts%ROWTYPE;
  assigned_talent talent%ROWTYPE;
BEGIN
  SELECT * INTO parent_assignment FROM assignments WHERE id = NEW.assignment_id;
  IF NOT FOUND OR parent_assignment.source <> 'client_owned' THEN
    RAISE EXCEPTION 'Client payment terms require a client-owned Assignment';
  END IF;
  SELECT * INTO parent_shift FROM shifts WHERE id = parent_assignment.shift_id;
  IF NOT FOUND OR parent_shift.residency_id <> NEW.residency_id OR parent_shift.economics_mode <> 'client_owned' THEN
    RAISE EXCEPTION 'Client payment terms must match their client-owned Residency slot';
  END IF;
  SELECT * INTO assigned_talent FROM talent WHERE id = parent_assignment.talent_id;
  IF NOT FOUND OR assigned_talent.ownership <> 'residency' OR assigned_talent.owning_residency_id <> NEW.residency_id THEN
    RAISE EXCEPTION 'Client payment terms require an artist owned by this Residency';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER "client_assignment_terms_validate_scope"
  BEFORE INSERT OR UPDATE OF "assignment_id", "residency_id"
  ON "client_assignment_terms"
  FOR EACH ROW EXECUTE FUNCTION validate_client_assignment_terms_scope();--> statement-breakpoint

CREATE OR REPLACE FUNCTION validate_hfy_talent_request_scope() RETURNS trigger AS $$
DECLARE
  parent_shift shifts%ROWTYPE;
  fulfilled_assignment assignments%ROWTYPE;
BEGIN
  SELECT * INTO parent_shift FROM shifts WHERE id = NEW.shift_id;
  IF NOT FOUND OR parent_shift.residency_id <> NEW.residency_id THEN
    RAISE EXCEPTION 'HFY request must match its Residency slot';
  END IF;
  IF NEW.status = 'pending' AND parent_shift.economics_mode <> 'hfy_request' THEN
    RAISE EXCEPTION 'Pending HFY request requires an HFY-request slot';
  END IF;
  IF NEW.status = 'fulfilled' THEN
    SELECT * INTO fulfilled_assignment FROM assignments WHERE id = NEW.fulfilled_assignment_id;
    IF NOT FOUND OR fulfilled_assignment.shift_id <> NEW.shift_id OR fulfilled_assignment.source <> 'hfy_request' THEN
      RAISE EXCEPTION 'Fulfilled HFY request requires its billed HFY Assignment';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER "hfy_talent_requests_validate_scope"
  BEFORE INSERT OR UPDATE OF "residency_id", "shift_id", "status", "fulfilled_assignment_id"
  ON "hfy_talent_requests"
  FOR EACH ROW EXECUTE FUNCTION validate_hfy_talent_request_scope();--> statement-breakpoint

CREATE OR REPLACE FUNCTION validate_assignment_scope() RETURNS trigger AS $$
DECLARE
  parent_shift shifts%ROWTYPE;
  assigned_talent talent%ROWTYPE;
BEGIN
  SELECT * INTO parent_shift FROM shifts WHERE id = NEW.shift_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment requires one valid Shift';
  END IF;
  IF NEW.starts_at < parent_shift.starts_at OR NEW.ends_at > parent_shift.ends_at THEN
    RAISE EXCEPTION 'Assignment time must stay within its Shift';
  END IF;

  IF NEW.talent_id IS NOT NULL THEN
    SELECT * INTO assigned_talent FROM talent WHERE id = NEW.talent_id;
    IF NOT FOUND OR assigned_talent.talent_status <> 'active' OR assigned_talent.archived_at IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM residency_talent rt
      WHERE rt.residency_id = parent_shift.residency_id AND rt.talent_id = NEW.talent_id AND rt.active = true
    ) OR (assigned_talent.exclusive_residency_id IS NOT NULL AND assigned_talent.exclusive_residency_id <> parent_shift.residency_id) THEN
      RAISE EXCEPTION 'Assignment requires an active artist explicitly assigned to this Residency';
    END IF;
  END IF;

  IF NEW.source = 'hotel' THEN
    IF NEW.booking_status <> 'pending_hfy_confirmation' THEN
      RAISE EXCEPTION 'Hotel selections must be Pending HFY Confirmation';
    END IF;
    IF NEW.talent_id IS NULL THEN
      RAISE EXCEPTION 'Hotel selection requires an artist explicitly assigned to this Residency';
    END IF;
  ELSIF NEW.source = 'client_owned' THEN
    IF NEW.talent_id IS NULL
      OR parent_shift.economics_mode <> 'client_owned'
      OR assigned_talent.ownership <> 'residency'
      OR assigned_talent.owning_residency_id <> parent_shift.residency_id
      OR NEW.compensation_type <> 'na'
      OR NEW.payout_status <> 'na'
      OR NEW.talent_rate_cents <> 0
      OR NEW.total_compensation_cents <> 0 THEN
      RAISE EXCEPTION 'Client-owned Assignments cannot enter HFY billing or payout economics';
    END IF;
  ELSIF NEW.source = 'hfy_request' THEN
    IF NEW.talent_id IS NULL OR parent_shift.economics_mode <> 'hfy_request' OR assigned_talent.ownership <> 'hfy' THEN
      RAISE EXCEPTION 'HFY-request fulfillment requires an HFY artist and request slot';
    END IF;
  ELSIF parent_shift.economics_mode <> 'hfy' THEN
    RAISE EXCEPTION 'Only the matching Assignment source may use this slot';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS "assignments_validate_scope" ON "assignments";--> statement-breakpoint
CREATE TRIGGER "assignments_validate_scope"
  BEFORE INSERT OR UPDATE OF "shift_id", "talent_id", "starts_at", "ends_at", "source", "compensation_type", "talent_rate_cents", "total_compensation_cents", "payout_status"
  ON "assignments"
  FOR EACH ROW EXECUTE FUNCTION validate_assignment_scope();
