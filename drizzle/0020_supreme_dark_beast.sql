ALTER TABLE "users" ADD COLUMN "is_internal_test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_internal_test_role_valid" CHECK (NOT "users"."is_internal_test" OR "users"."role" = 'hotel_user');--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS private;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.enforce_single_customer_residency_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  internal_test boolean;
BEGIN
  SELECT account.is_internal_test
    INTO internal_test
    FROM public.users AS account
    WHERE account.id = NEW.user_id
    FOR UPDATE;

  IF NEW.active = true
    AND COALESCE(internal_test, false) = false
    AND EXISTS (
      SELECT 1
      FROM public.residency_memberships AS membership
      WHERE membership.user_id = NEW.user_id
        AND membership.active = true
        AND membership.residency_id <> NEW.residency_id
        AND membership.id <> NEW.id
    )
  THEN
    RAISE EXCEPTION 'Normal customer accounts may have only one active Residency membership.';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.prevent_invalid_internal_test_demotion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_internal_test = false
    AND OLD.is_internal_test = true
    AND (
      SELECT count(*)
      FROM public.residency_memberships AS membership
      WHERE membership.user_id = NEW.id
        AND membership.active = true
    ) > 1
  THEN
    RAISE EXCEPTION 'Remove extra Residency memberships before converting this account to a customer account.';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

DROP TRIGGER IF EXISTS "residency_memberships_single_customer_residency" ON "residency_memberships";--> statement-breakpoint
CREATE TRIGGER "residency_memberships_single_customer_residency"
BEFORE INSERT OR UPDATE OF "user_id", "residency_id", "active"
ON "residency_memberships"
FOR EACH ROW
EXECUTE FUNCTION private.enforce_single_customer_residency_membership();--> statement-breakpoint

DROP TRIGGER IF EXISTS "users_valid_internal_test_demotion" ON "users";--> statement-breakpoint
CREATE TRIGGER "users_valid_internal_test_demotion"
BEFORE UPDATE OF "is_internal_test"
ON "users"
FOR EACH ROW
EXECUTE FUNCTION private.prevent_invalid_internal_test_demotion();
