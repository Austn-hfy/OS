UPDATE "dayparts"
SET "color" = '#2783DC', "updated_at" = now()
WHERE upper("color") = '#EC4899'
  AND ("type" <> 'dj_artist' OR "billing_mode" IS DISTINCT FROM 'billed_by_hfy');
--> statement-breakpoint
UPDATE "dayparts"
SET "color" = '#EC4899', "updated_at" = now()
WHERE "type" = 'dj_artist'
  AND "billing_mode" = 'billed_by_hfy'
  AND upper("color") <> '#EC4899';
--> statement-breakpoint
UPDATE "shifts" AS "shift"
SET "calendar_color" = '#EC4899', "updated_at" = now()
FROM "hfy_talent_requests" AS "request"
WHERE "request"."shift_id" = "shift"."id"
  AND "request"."status" = 'fulfilled'
  AND upper(coalesce("shift"."calendar_color", '')) <> '#EC4899';
