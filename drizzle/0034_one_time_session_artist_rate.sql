ALTER TABLE "shifts" ADD COLUMN "client_talent_default_rate_cents" integer;--> statement-breakpoint
UPDATE "shifts" AS s
SET "client_talent_default_rate_cents" = existing."default_rate_cents"
FROM (
  SELECT a."shift_id", max(cat."default_rate_cents") AS "default_rate_cents"
  FROM "assignments" AS a
  INNER JOIN "client_assignment_terms" AS cat ON cat."assignment_id" = a."id"
  WHERE cat."default_rate_cents" IS NOT NULL
  GROUP BY a."shift_id"
) AS existing
WHERE s."id" = existing."shift_id"
  AND s."daypart_id" IS NULL
  AND s."economics_mode" = 'client_owned';--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_client_talent_default_rate_nonnegative" CHECK ("shifts"."client_talent_default_rate_cents" IS NULL OR "shifts"."client_talent_default_rate_cents" >= 0);
