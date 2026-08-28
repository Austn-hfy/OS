CREATE TYPE "public"."daypart_billing_mode" AS ENUM('billed_by_hfy', 'tracking_only');--> statement-breakpoint
CREATE TYPE "public"."daypart_type" AS ENUM('dj_artist', 'house_activity');--> statement-breakpoint
CREATE TABLE "schedule_occurrence_talent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"talent_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_occurrence_talent_time_valid" CHECK ("schedule_occurrence_talent"."ends_at" > "schedule_occurrence_talent"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "schedule_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"residency_id" uuid NOT NULL,
	"daypart_id" uuid NOT NULL,
	"service_date" date NOT NULL,
	"name" text NOT NULL,
	"room" text NOT NULL,
	"color" text NOT NULL,
	"type" "daypart_type" NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_occurrences_time_valid" CHECK ("schedule_occurrences"."ends_at" > "schedule_occurrences"."starts_at"),
	CONSTRAINT "schedule_occurrences_color_valid" CHECK ("schedule_occurrences"."color" ~ '^#[0-9A-Fa-f]{6}$')
);
--> statement-breakpoint
ALTER TABLE "daypart_day_rules" DROP CONSTRAINT "daypart_day_rules_dj_count_valid";--> statement-breakpoint
ALTER TABLE "daypart_day_rules" ALTER COLUMN "default_dj_count" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "daypart_day_rules" ALTER COLUMN "default_dj_count" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dayparts" ADD COLUMN "type" "daypart_type" DEFAULT 'dj_artist' NOT NULL;--> statement-breakpoint
ALTER TABLE "dayparts" ADD COLUMN "billing_mode" "daypart_billing_mode" DEFAULT 'billed_by_hfy';--> statement-breakpoint
ALTER TABLE "schedule_occurrence_talent" ADD CONSTRAINT "schedule_occurrence_talent_occurrence_id_schedule_occurrences_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."schedule_occurrences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_occurrence_talent" ADD CONSTRAINT "schedule_occurrence_talent_talent_id_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_occurrences" ADD CONSTRAINT "schedule_occurrences_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_occurrences" ADD CONSTRAINT "schedule_occurrences_daypart_id_dayparts_id_fk" FOREIGN KEY ("daypart_id") REFERENCES "public"."dayparts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_occurrences" ADD CONSTRAINT "schedule_occurrences_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schedule_occurrence_talent_occurrence_idx" ON "schedule_occurrence_talent" USING btree ("occurrence_id");--> statement-breakpoint
CREATE INDEX "schedule_occurrence_talent_talent_time_idx" ON "schedule_occurrence_talent" USING btree ("talent_id","starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_occurrence_talent_unique" ON "schedule_occurrence_talent" USING btree ("occurrence_id","talent_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_occurrences_daypart_date_unique" ON "schedule_occurrences" USING btree ("daypart_id","service_date");--> statement-breakpoint
CREATE INDEX "schedule_occurrences_residency_date_idx" ON "schedule_occurrences" USING btree ("residency_id","service_date");--> statement-breakpoint
ALTER TABLE "daypart_day_rules" ADD CONSTRAINT "daypart_day_rules_dj_count_valid" CHECK ("daypart_day_rules"."default_dj_count" IS NULL OR ("daypart_day_rules"."default_dj_count" > 0 AND "daypart_day_rules"."default_dj_count" <= 20));--> statement-breakpoint
ALTER TABLE "dayparts" ADD CONSTRAINT "dayparts_type_fields_valid" CHECK (
    ("dayparts"."type" = 'house_activity' AND "dayparts"."billing_mode" IS NULL AND "dayparts"."default_talent_rate_cents" IS NULL)
    OR
    ("dayparts"."type" = 'dj_artist' AND "dayparts"."billing_mode" = 'tracking_only' AND "dayparts"."default_talent_rate_cents" IS NULL)
    OR
    ("dayparts"."type" = 'dj_artist' AND "dayparts"."billing_mode" = 'billed_by_hfy')
  );--> statement-breakpoint
ALTER TABLE "schedule_occurrences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "schedule_occurrence_talent" ENABLE ROW LEVEL SECURITY;
