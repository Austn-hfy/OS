ALTER TABLE "dayparts" ADD COLUMN "color" text DEFAULT '#2783DC' NOT NULL;--> statement-breakpoint
ALTER TABLE "dayparts" ADD COLUMN "default_talent_rate_cents" integer;--> statement-breakpoint
ALTER TABLE "dayparts" ADD COLUMN "active_until" date;--> statement-breakpoint
ALTER TABLE "dayparts" ADD CONSTRAINT "dayparts_color_valid" CHECK ("dayparts"."color" ~ '^#[0-9A-Fa-f]{6}$');--> statement-breakpoint
ALTER TABLE "dayparts" ADD CONSTRAINT "dayparts_rate_nonnegative" CHECK ("dayparts"."default_talent_rate_cents" IS NULL OR "dayparts"."default_talent_rate_cents" >= 0);