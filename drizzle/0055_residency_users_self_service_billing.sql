ALTER TABLE "residency_memberships" ALTER COLUMN "access_role" SET DEFAULT 'calendar_viewer';
ALTER TABLE "residency_memberships" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "residency_contacts" ADD COLUMN "revoked_at" timestamp with time zone;
ALTER TABLE "residency_contacts" ADD COLUMN "invited_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null;
ALTER TABLE "residency_contacts" ADD COLUMN "role_changed_at" timestamp with time zone;
ALTER TABLE "residency_contacts" ADD COLUMN "role_changed_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null;

ALTER TABLE "platform_subscriptions" ADD COLUMN "payment_grace_ends_at" timestamp with time zone;
ALTER TABLE "platform_subscriptions" ADD COLUMN "access_restricted_at" timestamp with time zone;
ALTER TABLE "platform_subscriptions" ADD COLUMN "pending_change_kind" text DEFAULT 'none' NOT NULL;
ALTER TABLE "platform_subscriptions" ADD COLUMN "pending_change_effective_at" timestamp with time zone;
ALTER TABLE "platform_subscriptions" ADD COLUMN "pending_revision" integer;
ALTER TABLE "platform_subscriptions" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;
ALTER TABLE "platform_subscriptions" ADD COLUMN "pause_periods" integer;
ALTER TABLE "platform_subscriptions" ADD COLUMN "pause_effective_at" timestamp with time zone;
ALTER TABLE "platform_subscriptions" ADD COLUMN "pause_resumes_at" timestamp with time zone;
ALTER TABLE "platform_subscriptions" ADD COLUMN "paused_at" timestamp with time zone;

ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_pending_change_valid"
  CHECK ("pending_change_kind" IN ('none', 'downgrade', 'term_change', 'cancel', 'pause'));
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_pause_periods_valid"
  CHECK ("pause_periods" IS NULL OR "pause_periods" IN (1, 2, 3));
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_grace_valid"
  CHECK ("payment_grace_ends_at" IS NULL OR ("payment_failed_at" IS NOT NULL AND "payment_grace_ends_at" >= "payment_failed_at"));

-- Materialize every existing enrolled membership as a real client user row.
-- Reuse an inactive email-matched legacy contact before inserting, because the
-- pre-existing Residency/email uniqueness rule also covers inactive contacts.
UPDATE "residency_contacts" AS "contact"
SET "user_id" = "membership"."user_id",
    "name" = COALESCE(NULLIF("person"."display_name", ''), split_part("person"."email", '@', 1)),
    "email" = "person"."email",
    "access_role" = "membership"."access_role",
    "invitation_status" = 'active',
    "active" = true,
    "accepted_at" = COALESCE("contact"."accepted_at", "membership"."created_at"),
    "revoked_at" = null,
    "updated_at" = now()
FROM "residency_memberships" AS "membership"
INNER JOIN "users" AS "person" ON "person"."id" = "membership"."user_id"
WHERE "membership"."residency_id" = "contact"."residency_id"
  AND lower("contact"."email") = lower("person"."email")
  AND "membership"."active" = true
  AND NOT EXISTS (
    SELECT 1 FROM "residency_contacts" AS "linked"
    WHERE "linked"."residency_id" = "membership"."residency_id"
      AND "linked"."user_id" = "membership"."user_id"
  );

INSERT INTO "residency_contacts" (
  "residency_id", "user_id", "name", "email", "phone", "access_role",
  "invitation_status", "is_primary", "active", "invited_at", "accepted_at",
  "created_at", "updated_at"
)
SELECT
  "membership"."residency_id",
  "membership"."user_id",
  COALESCE(NULLIF("person"."display_name", ''), split_part("person"."email", '@', 1)),
  "person"."email",
  CASE WHEN lower("person"."email") = lower("residency"."primary_contact_email") THEN "residency"."primary_contact_phone" ELSE '' END,
  "membership"."access_role",
  'active', false, true, "membership"."created_at", "membership"."created_at",
  "membership"."created_at", now()
FROM "residency_memberships" AS "membership"
INNER JOIN "users" AS "person" ON "person"."id" = "membership"."user_id"
INNER JOIN "residencies" AS "residency" ON "residency"."id" = "membership"."residency_id"
WHERE "membership"."active" = true
  AND NOT EXISTS (
    SELECT 1 FROM "residency_contacts" AS "contact"
    WHERE "contact"."residency_id" = "membership"."residency_id"
      AND ("contact"."user_id" = "membership"."user_id" OR lower("contact"."email") = lower("person"."email"))
  );

-- Existing enrolled contacts predate invitation-state tracking. Reconcile those
-- records before choosing a primary contact so the new invariant is truthful.
UPDATE "residency_contacts" AS "contact"
SET "invitation_status" = 'active',
    "accepted_at" = COALESCE("contact"."accepted_at", "membership"."created_at"),
    "access_role" = "membership"."access_role",
    "updated_at" = now()
FROM "residency_memberships" AS "membership"
WHERE "membership"."residency_id" = "contact"."residency_id"
  AND "membership"."user_id" = "contact"."user_id"
  AND "membership"."active" = true
  AND "contact"."active" = true;

-- Preserve an already-linked primary. If a legacy primary is still free text,
-- first match it to an enrolled user; otherwise choose the earliest manager so
-- every operating Residency remains administrable without inventing an account.
UPDATE "residency_contacts" AS "contact"
SET "is_primary" = false
WHERE "is_primary" = true
  AND NOT EXISTS (
    SELECT 1 FROM "residency_memberships" AS "membership"
    WHERE "membership"."residency_id" = "contact"."residency_id"
      AND "membership"."user_id" = "contact"."user_id"
      AND "membership"."active" = true
  );

WITH "duplicate_primaries" AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "residency_id" ORDER BY "created_at", "id"
  ) AS "rank"
  FROM "residency_contacts"
  WHERE "active" = true AND "is_primary" = true
)
UPDATE "residency_contacts" AS "contact"
SET "is_primary" = false
FROM "duplicate_primaries" AS "duplicate"
WHERE "contact"."id" = "duplicate"."id" AND "duplicate"."rank" > 1;

WITH "ranked_legacy_matches" AS (
  SELECT "contact"."id", row_number() OVER (
    PARTITION BY "contact"."residency_id"
    ORDER BY CASE WHEN "membership"."access_role" = 'manager' THEN 0 ELSE 1 END, "membership"."created_at", "contact"."created_at"
  ) AS "rank"
  FROM "residency_contacts" AS "contact"
  INNER JOIN "residencies" AS "residency" ON "residency"."id" = "contact"."residency_id"
  INNER JOIN "residency_memberships" AS "membership"
    ON "membership"."residency_id" = "contact"."residency_id"
    AND "membership"."user_id" = "contact"."user_id"
    AND "membership"."active" = true
  WHERE "contact"."active" = true
    AND lower("contact"."email") = lower("residency"."primary_contact_email")
    AND NOT EXISTS (
      SELECT 1 FROM "residency_contacts" AS "existing"
      WHERE "existing"."residency_id" = "contact"."residency_id"
        AND "existing"."active" = true
        AND "existing"."is_primary" = true
    )
)
UPDATE "residency_contacts" AS "contact"
SET "is_primary" = true
FROM "ranked_legacy_matches" AS "match"
WHERE "contact"."id" = "match"."id" AND "match"."rank" = 1;

WITH "manager_candidates" AS (
  SELECT "contact"."id", row_number() OVER (
    PARTITION BY "contact"."residency_id"
    ORDER BY "membership"."created_at", "contact"."created_at"
  ) AS "rank"
  FROM "residency_contacts" AS "contact"
  INNER JOIN "residency_memberships" AS "membership"
    ON "membership"."residency_id" = "contact"."residency_id"
    AND "membership"."user_id" = "contact"."user_id"
    AND "membership"."active" = true
    AND "membership"."access_role" = 'manager'
  WHERE "contact"."active" = true
    AND "contact"."invitation_status" = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM "residency_contacts" AS "existing"
      WHERE "existing"."residency_id" = "contact"."residency_id"
        AND "existing"."active" = true
        AND "existing"."is_primary" = true
    )
)
UPDATE "residency_contacts" AS "contact"
SET "is_primary" = true
FROM "manager_candidates" AS "candidate"
WHERE "contact"."id" = "candidate"."id" AND "candidate"."rank" = 1;

CREATE UNIQUE INDEX "residency_contacts_one_active_primary"
  ON "residency_contacts" ("residency_id")
  WHERE "active" = true AND "is_primary" = true;

CREATE OR REPLACE FUNCTION "hfy_enforce_residency_user_limit"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_residency uuid;
  seat_count integer;
BEGIN
  target_residency := COALESCE(NEW.residency_id, OLD.residency_id);
  PERFORM pg_advisory_xact_lock(hashtext(target_residency::text));
  SELECT count(*) INTO seat_count FROM (
    SELECT 'user:' || membership.user_id::text AS seat
    FROM residency_memberships AS membership
    WHERE membership.residency_id = target_residency AND membership.active = true
    UNION
    SELECT CASE
      WHEN contact.user_id IS NOT NULL THEN 'user:' || contact.user_id::text
      ELSE 'contact:' || contact.id::text
    END AS seat
    FROM residency_contacts AS contact
    WHERE contact.residency_id = target_residency
      AND contact.active = true
      AND contact.invitation_status = 'invited'
  ) AS occupied;
  IF seat_count > 4 THEN
    RAISE EXCEPTION 'A Residency can have at most four pending or active users.' USING ERRCODE = '23514';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER "residency_memberships_user_limit"
AFTER INSERT OR UPDATE OF "active", "residency_id", "user_id" ON "residency_memberships"
FOR EACH ROW EXECUTE FUNCTION "hfy_enforce_residency_user_limit"();
CREATE TRIGGER "residency_contacts_user_limit"
AFTER INSERT OR UPDATE OF "active", "invitation_status", "residency_id", "user_id" ON "residency_contacts"
FOR EACH ROW EXECUTE FUNCTION "hfy_enforce_residency_user_limit"();

CREATE OR REPLACE FUNCTION "hfy_enforce_last_residency_manager"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  remaining_managers integer;
BEGIN
  -- Do not turn the lockout guard into a blocker for an intentional parent
  -- Residency deletion whose foreign keys are cascading these memberships.
  IF TG_OP = 'DELETE' AND NOT EXISTS (
    SELECT 1 FROM residencies WHERE id = OLD.residency_id
  ) THEN
    RETURN OLD;
  END IF;
  IF OLD.active = true AND OLD.access_role = 'manager'
    AND (TG_OP = 'DELETE' OR NEW.active = false OR NEW.access_role <> 'manager') THEN
    PERFORM pg_advisory_xact_lock(hashtext(OLD.residency_id::text));
    SELECT count(*) INTO remaining_managers
    FROM residency_memberships
    WHERE residency_id = OLD.residency_id
      AND active = true
      AND access_role = 'manager'
      AND id <> OLD.id;
    IF remaining_managers = 0 THEN
      RAISE EXCEPTION 'The final manager cannot be removed or demoted.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER "residency_memberships_keep_manager"
BEFORE UPDATE OR DELETE ON "residency_memberships"
FOR EACH ROW EXECUTE FUNCTION "hfy_enforce_last_residency_manager"();

CREATE OR REPLACE FUNCTION "hfy_enforce_primary_residency_contact"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.active = true AND NEW.is_primary = true THEN
    IF NEW.user_id IS NULL OR NEW.invitation_status <> 'active' OR NOT EXISTS (
      SELECT 1 FROM residency_memberships AS membership
      WHERE membership.residency_id = NEW.residency_id
        AND membership.user_id = NEW.user_id
        AND membership.active = true
    ) THEN
      RAISE EXCEPTION 'The primary contact must be an active enrolled user.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "residency_contacts_primary_must_be_enrolled"
BEFORE INSERT OR UPDATE OF "active", "is_primary", "invitation_status", "user_id" ON "residency_contacts"
FOR EACH ROW EXECUTE FUNCTION "hfy_enforce_primary_residency_contact"();
