DROP POLICY IF EXISTS "talent_read_approved_safe_roster" ON "talent";--> statement-breakpoint
CREATE POLICY "talent_read_approved_safe_roster" ON "talent" FOR SELECT TO authenticated USING (
  "talent_status" = 'active'
  AND "archived_at" IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.residency_talent AS rt
    WHERE rt.talent_id = "talent"."id"
      AND rt.active = true
      AND rt.residency_id IN (SELECT private.current_residency_ids())
      AND ("talent"."exclusive_residency_id" IS NULL OR "talent"."exclusive_residency_id" = rt.residency_id)
  )
);--> statement-breakpoint

CREATE OR REPLACE FUNCTION validate_residency_talent_scope() RETURNS trigger AS $$
DECLARE
  artist talent%ROWTYPE;
BEGIN
  IF NEW.active = false THEN
    RETURN NEW;
  END IF;

  SELECT * INTO artist FROM talent WHERE id = NEW.talent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Residency roster assignment requires one valid artist';
  END IF;
  IF artist.exclusive_residency_id IS NOT NULL AND artist.exclusive_residency_id <> NEW.residency_id THEN
    RAISE EXCEPTION 'Exclusive artist can only be assigned to their exclusive Residency';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS "residency_talent_validate_scope" ON "residency_talent";--> statement-breakpoint
CREATE TRIGGER "residency_talent_validate_scope"
  BEFORE INSERT OR UPDATE OF "residency_id", "talent_id", "active"
  ON "residency_talent"
  FOR EACH ROW EXECUTE FUNCTION validate_residency_talent_scope();--> statement-breakpoint

CREATE OR REPLACE FUNCTION validate_assignment_scope() RETURNS trigger AS $$
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

  IF NEW.talent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM residency_talent rt
    JOIN talent t ON t.id = rt.talent_id
    WHERE rt.residency_id = parent_shift.residency_id
      AND rt.talent_id = NEW.talent_id
      AND rt.active = true
      AND t.talent_status = 'active'
      AND t.archived_at IS NULL
      AND (t.exclusive_residency_id IS NULL OR t.exclusive_residency_id = parent_shift.residency_id)
  ) THEN
    RAISE EXCEPTION 'Assignment requires an active artist explicitly assigned to this Residency';
  END IF;

  IF NEW.source = 'hotel' THEN
    IF NEW.booking_status <> 'pending_hfy_confirmation' THEN
      RAISE EXCEPTION 'Hotel selections must be Pending HFY Confirmation';
    END IF;
    IF NEW.talent_id IS NULL THEN
      RAISE EXCEPTION 'Hotel selection requires an artist explicitly assigned to this Residency';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE OR REPLACE FUNCTION validate_occurrence_talent_scope() RETURNS trigger AS $$
DECLARE
  parent_occurrence schedule_occurrences%ROWTYPE;
BEGIN
  SELECT * INTO parent_occurrence FROM schedule_occurrences WHERE id = NEW.occurrence_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Occurrence talent requires one valid schedule occurrence';
  END IF;

  IF NEW.starts_at < parent_occurrence.starts_at OR NEW.ends_at > parent_occurrence.ends_at THEN
    RAISE EXCEPTION 'Occurrence talent time must stay within its schedule occurrence';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM residency_talent rt
    JOIN talent t ON t.id = rt.talent_id
    WHERE rt.residency_id = parent_occurrence.residency_id
      AND rt.talent_id = NEW.talent_id
      AND rt.active = true
      AND t.talent_status = 'active'
      AND t.archived_at IS NULL
      AND (t.exclusive_residency_id IS NULL OR t.exclusive_residency_id = parent_occurrence.residency_id)
  ) THEN
    RAISE EXCEPTION 'Occurrence talent requires an active artist explicitly assigned to this Residency';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS "schedule_occurrence_talent_validate_scope" ON "schedule_occurrence_talent";--> statement-breakpoint
CREATE TRIGGER "schedule_occurrence_talent_validate_scope"
  BEFORE INSERT OR UPDATE OF "occurrence_id", "talent_id", "starts_at", "ends_at"
  ON "schedule_occurrence_talent"
  FOR EACH ROW EXECUTE FUNCTION validate_occurrence_talent_scope();
