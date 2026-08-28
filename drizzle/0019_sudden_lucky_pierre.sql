ALTER TABLE "dayparts" DROP CONSTRAINT IF EXISTS "dayparts_type_fields_valid";--> statement-breakpoint
ALTER TABLE "schedule_occurrences" ADD COLUMN IF NOT EXISTS "notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "talent" ADD COLUMN IF NOT EXISTS "exclusive_residency_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'talent_exclusive_residency_id_residencies_id_fk') THEN
    ALTER TABLE "talent" ADD CONSTRAINT "talent_exclusive_residency_id_residencies_id_fk" FOREIGN KEY ("exclusive_residency_id") REFERENCES "public"."residencies"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "talent_exclusive_residency_idx" ON "talent" USING btree ("exclusive_residency_id");--> statement-breakpoint
ALTER TABLE "dayparts" ADD CONSTRAINT "dayparts_type_fields_valid" CHECK (
    ("dayparts"."type" = 'house_activity' AND "dayparts"."billing_mode" IS NULL AND "dayparts"."default_talent_rate_cents" IS NULL)
    OR
    ("dayparts"."type" = 'dj_artist' AND "dayparts"."billing_mode" = 'tracking_only' AND "dayparts"."default_talent_rate_cents" IS NULL)
    OR
    ("dayparts"."type" = 'dj_artist' AND "dayparts"."billing_mode" = 'billed_by_hfy')
  );--> statement-breakpoint

-- Correct the demo-created record that the former hard-coded save path stored
-- as DJ/Artist + Tracking Only. This is deliberately narrow and idempotent.
UPDATE "dayparts"
SET "type" = 'house_activity', "billing_mode" = NULL, "default_talent_rate_cents" = NULL, "updated_at" = now()
WHERE lower("name") = 'movie night'
  AND "type" = 'dj_artist'
  AND "billing_mode" = 'tracking_only'
  AND "residency_id" IN (SELECT "id" FROM "residencies" WHERE lower("name") LIKE 'ace hotel%');--> statement-breakpoint

CREATE SCHEMA IF NOT EXISTS private;--> statement-breakpoint
REVOKE ALL ON SCHEMA private FROM PUBLIC;--> statement-breakpoint
GRANT USAGE ON SCHEMA private TO authenticated;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.current_residency_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT membership.residency_id
  FROM public.residency_memberships AS membership
  JOIN public.residencies AS residency ON residency.id = membership.residency_id
  WHERE membership.user_id = (SELECT auth.uid())
    AND membership.active = true
    AND residency.active = true
    AND residency.operating_mode = 'operations'
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.current_managed_residency_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT membership.residency_id
  FROM public.residency_memberships AS membership
  JOIN public.residencies AS residency ON residency.id = membership.residency_id
  WHERE membership.user_id = (SELECT auth.uid())
    AND membership.active = true
    AND membership.access_role = 'manager'
    AND residency.active = true
    AND residency.operating_mode = 'operations'
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.current_residency_ids() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.current_managed_residency_ids() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.current_residency_ids() TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.current_managed_residency_ids() TO authenticated;--> statement-breakpoint

-- The server-side data layer remains the only mutation path. The Supabase Data
-- API receives read grants only for named, client-safe columns.
REVOKE ALL ON TABLE "users", "residency_memberships", "residencies", "dayparts", "daypart_day_rules", "talent", "residency_talent", "shifts", "assignments", "schedule_occurrences", "schedule_occurrence_talent", "public_calendar_links", "public_calendar_link_dayparts", "invoices", "invoice_line_items", "invoice_deliveries", "talent_payment_profiles", "talent_documents", "audit_log", "attention_items", "automation_runs", "client_accounts", "platform_settings", "residency_contacts" FROM anon, authenticated;--> statement-breakpoint

GRANT SELECT ("id", "email", "display_name", "role", "active") ON "users" TO authenticated;--> statement-breakpoint
GRANT SELECT ("id", "user_id", "residency_id", "access_role", "active") ON "residency_memberships" TO authenticated;--> statement-breakpoint
GRANT SELECT ("id", "slug", "name", "city_state", "timezone", "tier", "active", "operating_mode") ON "residencies" TO authenticated;--> statement-breakpoint
GRANT SELECT ("id", "residency_id", "name", "room", "color", "type", "billing_mode", "active_until", "active", "sort_order") ON "dayparts" TO authenticated;--> statement-breakpoint
GRANT SELECT ("id", "daypart_id", "weekday", "start_minute", "end_minute", "default_dj_count") ON "daypart_day_rules" TO authenticated;--> statement-breakpoint
GRANT SELECT ("id", "stage_name", "home_market", "genres", "instagram_handle", "talent_status", "archived_at") ON "talent" TO authenticated;--> statement-breakpoint
GRANT SELECT ("id", "residency_id", "talent_id", "active") ON "residency_talent" TO authenticated;--> statement-breakpoint
GRANT SELECT ("id", "residency_id", "daypart_id", "name", "service_date", "room", "starts_at", "ends_at", "program_details", "manual_host_name") ON "shifts" TO authenticated;--> statement-breakpoint
GRANT SELECT ("id", "shift_id", "talent_id", "guest_name", "starts_at", "ends_at", "booking_status", "payout_status", "paid_at") ON "assignments" TO authenticated;--> statement-breakpoint
GRANT SELECT ("id", "residency_id", "daypart_id", "service_date", "name", "room", "color", "type", "starts_at", "ends_at", "program_details", "manual_host_name") ON "schedule_occurrences" TO authenticated;--> statement-breakpoint
GRANT SELECT ("id", "occurrence_id", "talent_id", "starts_at", "ends_at") ON "schedule_occurrence_talent" TO authenticated;--> statement-breakpoint

DROP POLICY IF EXISTS "users_read_self" ON "users";--> statement-breakpoint
DROP POLICY IF EXISTS "memberships_read_self" ON "residency_memberships";--> statement-breakpoint
DROP POLICY IF EXISTS "residencies_read_membership" ON "residencies";--> statement-breakpoint
DROP POLICY IF EXISTS "dayparts_read_membership" ON "dayparts";--> statement-breakpoint
DROP POLICY IF EXISTS "daypart_rules_read_membership" ON "daypart_day_rules";--> statement-breakpoint
DROP POLICY IF EXISTS "residency_talent_read_membership" ON "residency_talent";--> statement-breakpoint
DROP POLICY IF EXISTS "talent_read_approved_safe_roster" ON "talent";--> statement-breakpoint
DROP POLICY IF EXISTS "shifts_read_membership" ON "shifts";--> statement-breakpoint
DROP POLICY IF EXISTS "assignments_read_membership" ON "assignments";--> statement-breakpoint
DROP POLICY IF EXISTS "occurrences_read_membership" ON "schedule_occurrences";--> statement-breakpoint
DROP POLICY IF EXISTS "occurrence_talent_read_membership" ON "schedule_occurrence_talent";--> statement-breakpoint

CREATE POLICY "users_read_self" ON "users" FOR SELECT TO authenticated USING ("id" = (SELECT auth.uid()));--> statement-breakpoint
CREATE POLICY "memberships_read_self" ON "residency_memberships" FOR SELECT TO authenticated USING ("user_id" = (SELECT auth.uid()) AND "active" = true);--> statement-breakpoint
CREATE POLICY "residencies_read_membership" ON "residencies" FOR SELECT TO authenticated USING ("id" IN (SELECT private.current_residency_ids()));--> statement-breakpoint
CREATE POLICY "dayparts_read_membership" ON "dayparts" FOR SELECT TO authenticated USING ("residency_id" IN (SELECT private.current_residency_ids()));--> statement-breakpoint
CREATE POLICY "daypart_rules_read_membership" ON "daypart_day_rules" FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.dayparts AS daypart WHERE daypart.id = "daypart_id" AND daypart.residency_id IN (SELECT private.current_residency_ids())));--> statement-breakpoint
CREATE POLICY "residency_talent_read_membership" ON "residency_talent" FOR SELECT TO authenticated USING ("residency_id" IN (SELECT private.current_residency_ids()) AND "active" = true);--> statement-breakpoint
CREATE POLICY "talent_read_approved_safe_roster" ON "talent" FOR SELECT TO authenticated USING (
  "talent_status" = 'active' AND "archived_at" IS NULL
  AND ("exclusive_residency_id" IS NULL OR "exclusive_residency_id" IN (SELECT private.current_residency_ids()))
);--> statement-breakpoint
CREATE POLICY "shifts_read_membership" ON "shifts" FOR SELECT TO authenticated USING ("residency_id" IN (SELECT private.current_residency_ids()));--> statement-breakpoint
CREATE POLICY "assignments_read_membership" ON "assignments" FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.shifts AS shift WHERE shift.id = "shift_id" AND shift.residency_id IN (SELECT private.current_residency_ids())));--> statement-breakpoint
CREATE POLICY "occurrences_read_membership" ON "schedule_occurrences" FOR SELECT TO authenticated USING ("residency_id" IN (SELECT private.current_residency_ids()));--> statement-breakpoint
CREATE POLICY "occurrence_talent_read_membership" ON "schedule_occurrence_talent" FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.schedule_occurrences AS occurrence WHERE occurrence.id = "occurrence_id" AND occurrence.residency_id IN (SELECT private.current_residency_ids())));
