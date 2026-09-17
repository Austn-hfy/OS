ALTER TABLE "shift_change_requests"
  DROP CONSTRAINT "shift_change_requests_shift_id_shifts_id_fk";--> statement-breakpoint
ALTER TABLE "shift_change_requests"
  ALTER COLUMN "shift_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shift_change_requests"
  ADD CONSTRAINT "shift_change_requests_shift_id_shifts_id_fk"
  FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_change_requests"
  ADD CONSTRAINT "shift_change_requests_pending_shift_required"
  CHECK ("status" <> 'pending' OR "shift_id" IS NOT NULL);--> statement-breakpoint

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
  IF NEW.shift_id IS NULL THEN
    IF NEW.status = 'pending' THEN
      RAISE EXCEPTION 'A pending Shift change request must reference a Shift.';
    END IF;
    RETURN NEW;
  END IF;

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

REVOKE ALL ON FUNCTION private.validate_shift_change_request_scope() FROM PUBLIC;
