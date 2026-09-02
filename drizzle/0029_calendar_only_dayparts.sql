CREATE TYPE "public"."daypart_schedule_mode" AS ENUM('standing_weekly', 'calendar_only');
ALTER TABLE "dayparts" ADD COLUMN "schedule_mode" "daypart_schedule_mode" DEFAULT 'standing_weekly' NOT NULL;
ALTER TABLE "dayparts" ADD COLUMN "suggested_start_minute" integer;
ALTER TABLE "dayparts" ADD COLUMN "suggested_end_minute" integer;
ALTER TABLE "dayparts" ADD CONSTRAINT "dayparts_schedule_fields_valid" CHECK (
  ("schedule_mode" = 'standing_weekly' AND "suggested_start_minute" IS NULL AND "suggested_end_minute" IS NULL)
  OR
  ("schedule_mode" = 'calendar_only' AND "suggested_start_minute" IS NOT NULL AND "suggested_end_minute" IS NOT NULL AND "suggested_start_minute" >= 0 AND "suggested_start_minute" < 1440 AND "suggested_end_minute" > "suggested_start_minute" AND "suggested_end_minute" <= "suggested_start_minute" + 1440)
);
