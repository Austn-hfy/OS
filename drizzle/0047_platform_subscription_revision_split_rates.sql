ALTER TABLE "platform_subscription_revisions"
  ADD COLUMN "talent_session_unit_amount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_subscription_revisions"
  ADD COLUMN "house_program_unit_amount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

UPDATE "platform_subscription_revisions"
SET
  "talent_session_unit_amount_cents" = "unit_amount_cents",
  "house_program_unit_amount_cents" = "unit_amount_cents";--> statement-breakpoint

ALTER TABLE "platform_subscription_revisions"
  ALTER COLUMN "unit_amount_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "platform_subscription_revisions"
  DROP CONSTRAINT "platform_subscription_revisions_values_valid";--> statement-breakpoint
ALTER TABLE "platform_subscription_revisions"
  ADD CONSTRAINT "platform_subscription_revisions_values_valid" CHECK (
    "platform_subscription_revisions"."talent_program_sessions" >= 0
    AND "platform_subscription_revisions"."talent_session_unit_amount_cents" >= 0
    AND "platform_subscription_revisions"."house_programs" >= 0
    AND "platform_subscription_revisions"."house_program_unit_amount_cents" >= 0
    AND "platform_subscription_revisions"."one_off_allowance" >= 0
    AND "platform_subscription_revisions"."unit_amount_cents" >= 0
  );
