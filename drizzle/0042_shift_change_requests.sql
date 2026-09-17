CREATE TYPE "public"."shift_change_request_type" AS ENUM('change_time', 'cancel_occurrence', 'delete_permanent');--> statement-breakpoint
CREATE TYPE "public"."shift_change_request_status" AS ENUM('pending', 'approved', 'denied');--> statement-breakpoint

CREATE TABLE "shift_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"residency_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"request_type" "shift_change_request_type" NOT NULL,
	"manager_note" text NOT NULL,
	"proposed_start_at" timestamp with time zone,
	"proposed_end_at" timestamp with time zone,
	"status" "shift_change_request_status" DEFAULT 'pending' NOT NULL,
	"resolved_by" uuid,
	"resolution_note" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_change_requests_manager_note_required" CHECK (length(btrim("shift_change_requests"."manager_note")) > 0),
	CONSTRAINT "shift_change_requests_proposed_time_valid" CHECK (
    ("shift_change_requests"."request_type" = 'change_time' AND "shift_change_requests"."proposed_start_at" IS NOT NULL AND "shift_change_requests"."proposed_end_at" IS NOT NULL AND "shift_change_requests"."proposed_end_at" > "shift_change_requests"."proposed_start_at")
    OR
    ("shift_change_requests"."request_type" <> 'change_time' AND "shift_change_requests"."proposed_start_at" IS NULL AND "shift_change_requests"."proposed_end_at" IS NULL)
  ),
	CONSTRAINT "shift_change_requests_resolution_valid" CHECK (
    ("shift_change_requests"."status" = 'pending' AND "shift_change_requests"."resolved_by" IS NULL AND "shift_change_requests"."resolution_note" IS NULL AND "shift_change_requests"."resolved_at" IS NULL)
    OR
    ("shift_change_requests"."status" <> 'pending' AND "shift_change_requests"."resolved_by" IS NOT NULL AND "shift_change_requests"."resolved_at" IS NOT NULL)
  )
);--> statement-breakpoint

ALTER TABLE "shift_change_requests" ADD CONSTRAINT "shift_change_requests_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_change_requests" ADD CONSTRAINT "shift_change_requests_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_change_requests" ADD CONSTRAINT "shift_change_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_change_requests" ADD CONSTRAINT "shift_change_requests_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shift_change_requests_residency_status_created_idx" ON "shift_change_requests" USING btree ("residency_id", "status", "created_at");--> statement-breakpoint
CREATE INDEX "shift_change_requests_shift_created_idx" ON "shift_change_requests" USING btree ("shift_id", "created_at");--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.current_user_is_internal_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users AS account
    WHERE account.id = (SELECT auth.uid())
      AND account.role = 'internal_admin'
      AND account.active = true
  )
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.current_user_is_internal_admin() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.current_user_is_internal_admin() TO authenticated;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.validate_shift_change_request_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  parent_residency_id uuid;
  parent_economics_mode public.shift_economics_mode;
  resolver_is_internal_admin boolean;
BEGIN
  SELECT shift.residency_id, shift.economics_mode
    INTO parent_residency_id, parent_economics_mode
    FROM public.shifts AS shift
    WHERE shift.id = NEW.shift_id;

  IF parent_residency_id IS NULL OR parent_residency_id <> NEW.residency_id THEN
    RAISE EXCEPTION 'Shift change request must match its Shift Residency.';
  END IF;

  IF parent_economics_mode <> 'hfy' THEN
    RAISE EXCEPTION 'Shift change requests are only valid for Shifts billed by HFY.';
  END IF;

  IF NEW.status <> 'pending' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.users AS account
      WHERE account.id = NEW.resolved_by
        AND account.role = 'internal_admin'
        AND account.active = true
    ) INTO resolver_is_internal_admin;

    IF NOT resolver_is_internal_admin THEN
      RAISE EXCEPTION 'Shift change requests must be resolved by an active owner/admin.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.validate_shift_change_request_scope() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER "shift_change_requests_validate_scope"
  BEFORE INSERT OR UPDATE OF "shift_id", "residency_id", "status", "resolved_by"
  ON "shift_change_requests"
  FOR EACH ROW EXECUTE FUNCTION private.validate_shift_change_request_scope();--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.audit_shift_change_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  audit_actor_id uuid;
  audit_actor_label text;
  audit_action text;
  audit_details jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    audit_actor_id := NEW.requested_by;
    audit_action := 'shift_change_request_created';
    audit_details := jsonb_build_object(
      'shiftId', NEW.shift_id,
      'requestType', NEW.request_type,
      'managerNote', NEW.manager_note,
      'proposedStartAt', NEW.proposed_start_at,
      'proposedEndAt', NEW.proposed_end_at
    );
  ELSIF OLD.status = 'pending' AND NEW.status <> 'pending' THEN
    audit_actor_id := NEW.resolved_by;
    audit_action := 'shift_change_request_resolved';
    audit_details := jsonb_build_object(
      'shiftId', NEW.shift_id,
      'requestType', NEW.request_type,
      'status', NEW.status,
      'resolutionNote', NEW.resolution_note
    );
  ELSE
    RETURN NEW;
  END IF;

  SELECT account.email
    INTO audit_actor_label
    FROM public.users AS account
    WHERE account.id = audit_actor_id;

  INSERT INTO public.audit_log (
    "residency_id", "actor_user_id", "actor_label", "action", "entity_type", "entity_id", "details"
  ) VALUES (
    NEW.residency_id,
    audit_actor_id,
    audit_actor_label,
    audit_action,
    'shift_change_request',
    NEW.id,
    audit_details
  );

  RETURN NEW;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.audit_shift_change_request() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER "shift_change_requests_audit"
  AFTER INSERT OR UPDATE OF "status"
  ON "shift_change_requests"
  FOR EACH ROW EXECUTE FUNCTION private.audit_shift_change_request();--> statement-breakpoint

ALTER TABLE "shift_change_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "shift_change_requests" FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT ON TABLE "shift_change_requests" TO authenticated;--> statement-breakpoint
GRANT INSERT ("shift_id", "residency_id", "requested_by", "request_type", "manager_note", "proposed_start_at", "proposed_end_at") ON TABLE "shift_change_requests" TO authenticated;--> statement-breakpoint

CREATE POLICY "shift_change_requests_read_managed_residency" ON "shift_change_requests"
FOR SELECT TO authenticated
USING (
  "residency_id" IN (SELECT private.current_managed_residency_ids())
  OR (SELECT private.current_user_is_internal_admin())
);--> statement-breakpoint

CREATE POLICY "shift_change_requests_insert_managed_residency" ON "shift_change_requests"
FOR INSERT TO authenticated
WITH CHECK (
  "residency_id" IN (SELECT private.current_managed_residency_ids())
  AND "requested_by" = (SELECT auth.uid())
  AND "status" = 'pending'
  AND "resolved_by" IS NULL
  AND "resolution_note" IS NULL
  AND "resolved_at" IS NULL
);
