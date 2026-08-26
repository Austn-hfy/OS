CREATE TABLE "daypart_day_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"daypart_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"default_dj_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daypart_day_rules_weekday_valid" CHECK ("daypart_day_rules"."weekday" >= 0 AND "daypart_day_rules"."weekday" <= 6),
	CONSTRAINT "daypart_day_rules_start_valid" CHECK ("daypart_day_rules"."start_minute" >= 0 AND "daypart_day_rules"."start_minute" < 1440),
	CONSTRAINT "daypart_day_rules_end_valid" CHECK ("daypart_day_rules"."end_minute" > "daypart_day_rules"."start_minute" AND "daypart_day_rules"."end_minute" <= "daypart_day_rules"."start_minute" + 1440),
	CONSTRAINT "daypart_day_rules_dj_count_valid" CHECK ("daypart_day_rules"."default_dj_count" > 0 AND "daypart_day_rules"."default_dj_count" <= 20)
);
--> statement-breakpoint
CREATE TABLE "dayparts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"residency_id" uuid NOT NULL,
	"name" text NOT NULL,
	"room" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assignments" DROP CONSTRAINT "assignments_money_nonnegative";--> statement-breakpoint
ALTER TABLE "shifts" DROP CONSTRAINT "shifts_client_rate_nonnegative";--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "talent_rate_override_cents" integer;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "daypart_id" uuid;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "client_rate_override_cents" integer;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "invoice_link_issue" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "invoice_link_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "daypart_day_rules" ADD CONSTRAINT "daypart_day_rules_daypart_id_dayparts_id_fk" FOREIGN KEY ("daypart_id") REFERENCES "public"."dayparts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dayparts" ADD CONSTRAINT "dayparts_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daypart_day_rules_daypart_weekday_unique" ON "daypart_day_rules" USING btree ("daypart_id","weekday");--> statement-breakpoint
CREATE INDEX "daypart_day_rules_weekday_idx" ON "daypart_day_rules" USING btree ("weekday","daypart_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dayparts_residency_name_unique" ON "dayparts" USING btree ("residency_id",lower("name"));--> statement-breakpoint
CREATE INDEX "dayparts_residency_active_idx" ON "dayparts" USING btree ("residency_id","active","sort_order");--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_daypart_id_dayparts_id_fk" FOREIGN KEY ("daypart_id") REFERENCES "public"."dayparts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shifts_daypart_idx" ON "shifts" USING btree ("daypart_id","service_date");--> statement-breakpoint
CREATE UNIQUE INDEX "shifts_daypart_date_unique" ON "shifts" USING btree ("daypart_id","service_date") WHERE "shifts"."daypart_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_money_nonnegative" CHECK ("assignments"."talent_rate_cents" >= 0 AND ("assignments"."talent_rate_override_cents" IS NULL OR "assignments"."talent_rate_override_cents" >= 0) AND "assignments"."total_compensation_cents" >= 0 AND ("assignments"."fixed_fee_cents" IS NULL OR "assignments"."fixed_fee_cents" >= 0) AND ("assignments"."paid_amount_cents" IS NULL OR "assignments"."paid_amount_cents" >= 0));--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_client_rate_nonnegative" CHECK ("shifts"."client_rate_cents" >= 0 AND ("shifts"."client_rate_override_cents" IS NULL OR "shifts"."client_rate_override_cents" >= 0));
--> statement-breakpoint
ALTER TABLE "dayparts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "daypart_day_rules" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "dayparts"
  ADD CONSTRAINT "dayparts_id_residency_unique" UNIQUE ("id", "residency_id");
--> statement-breakpoint
ALTER TABLE "shifts"
  ADD CONSTRAINT "shifts_daypart_same_residency_fk"
  FOREIGN KEY ("daypart_id", "residency_id")
  REFERENCES "dayparts" ("id", "residency_id");
