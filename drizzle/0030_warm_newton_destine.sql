ALTER TABLE "client_assignment_terms" DROP CONSTRAINT "client_assignment_terms_rate_nonnegative";--> statement-breakpoint
ALTER TABLE "dayparts" DROP CONSTRAINT "dayparts_rate_nonnegative";--> statement-breakpoint
ALTER TABLE "dayparts" DROP CONSTRAINT "dayparts_type_fields_valid";--> statement-breakpoint
ALTER TABLE "client_assignment_terms" ADD COLUMN "default_rate_cents" integer;--> statement-breakpoint
ALTER TABLE "dayparts" ADD COLUMN "client_default_rate_cents" integer;--> statement-breakpoint
ALTER TABLE "client_assignment_terms" ADD CONSTRAINT "client_assignment_terms_rate_nonnegative" CHECK (("client_assignment_terms"."default_rate_cents" IS NULL OR "client_assignment_terms"."default_rate_cents" >= 0) AND ("client_assignment_terms"."rate_cents" IS NULL OR "client_assignment_terms"."rate_cents" >= 0));--> statement-breakpoint
ALTER TABLE "dayparts" ADD CONSTRAINT "dayparts_rate_nonnegative" CHECK (("dayparts"."default_talent_rate_cents" IS NULL OR "dayparts"."default_talent_rate_cents" >= 0) AND ("dayparts"."client_default_rate_cents" IS NULL OR "dayparts"."client_default_rate_cents" >= 0));--> statement-breakpoint
ALTER TABLE "dayparts" ADD CONSTRAINT "dayparts_type_fields_valid" CHECK (
    ("dayparts"."type" = 'house_activity' AND "dayparts"."billing_mode" IS NULL AND "dayparts"."default_talent_rate_cents" IS NULL AND "dayparts"."client_default_rate_cents" IS NULL)
    OR
    ("dayparts"."type" = 'dj_artist' AND "dayparts"."billing_mode" = 'tracking_only' AND "dayparts"."default_talent_rate_cents" IS NULL)
    OR
    ("dayparts"."type" = 'dj_artist' AND "dayparts"."billing_mode" = 'billed_by_hfy' AND "dayparts"."client_default_rate_cents" IS NULL)
  );
