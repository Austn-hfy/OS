ALTER TABLE "dayparts" DROP CONSTRAINT "dayparts_type_fields_valid";--> statement-breakpoint
ALTER TABLE "schedule_occurrences" ADD COLUMN "program_details" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "schedule_occurrences" ADD COLUMN "manual_host_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "program_details" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "manual_host_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "dayparts"
SET "type" = 'dj_artist', "billing_mode" = 'tracking_only', "default_talent_rate_cents" = NULL, "updated_at" = now()
WHERE "type" = 'house_activity';--> statement-breakpoint
UPDATE "schedule_occurrences"
SET "type" = 'dj_artist', "updated_at" = now()
WHERE "type" = 'house_activity';--> statement-breakpoint
ALTER TABLE "dayparts" ADD CONSTRAINT "dayparts_type_fields_valid" CHECK (
    ("dayparts"."type" = 'dj_artist' AND "dayparts"."billing_mode" = 'tracking_only' AND "dayparts"."default_talent_rate_cents" IS NULL)
    OR
    ("dayparts"."type" = 'dj_artist' AND "dayparts"."billing_mode" = 'billed_by_hfy')
  );
