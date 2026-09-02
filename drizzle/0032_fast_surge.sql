ALTER TABLE "residency_talent" ADD COLUMN "client_visible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "residency_talent" AS rt
SET "client_visible" = true
FROM "talent" AS t
WHERE t."id" = rt."talent_id"
  AND t."ownership" = 'residency'
  AND t."owning_residency_id" = rt."residency_id"
  AND rt."active" = true;--> statement-breakpoint
CREATE INDEX "residency_talent_client_visibility_idx" ON "residency_talent" USING btree ("residency_id","client_visible","active");

DROP POLICY IF EXISTS "residency_talent_read_membership" ON "residency_talent";--> statement-breakpoint
CREATE POLICY "residency_talent_read_membership" ON "residency_talent" FOR SELECT TO authenticated USING (
  "residency_id" IN (SELECT private.current_residency_ids())
  AND "active" = true
  AND "client_visible" = true
);--> statement-breakpoint

DROP POLICY IF EXISTS "talent_read_approved_safe_roster" ON "talent";--> statement-breakpoint
CREATE POLICY "talent_read_approved_safe_roster" ON "talent" FOR SELECT TO authenticated USING (
  "talent_status" = 'active'
  AND "archived_at" IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.residency_talent AS rt
    WHERE rt.talent_id = "talent"."id"
      AND rt.active = true
      AND rt.client_visible = true
      AND rt.residency_id IN (SELECT private.current_residency_ids())
      AND ("talent"."exclusive_residency_id" IS NULL OR "talent"."exclusive_residency_id" = rt.residency_id)
  )
);
