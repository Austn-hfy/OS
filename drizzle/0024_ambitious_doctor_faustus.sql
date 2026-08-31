CREATE TYPE "public"."daypart_date_exception_kind" AS ENUM('skip', 'override');--> statement-breakpoint
CREATE TABLE "daypart_date_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"daypart_id" uuid NOT NULL,
	"service_date" date NOT NULL,
	"kind" "daypart_date_exception_kind" NOT NULL,
	"start_minute" integer,
	"end_minute" integer,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daypart_date_exceptions_fields_valid" CHECK (
    ("daypart_date_exceptions"."kind" = 'skip' AND "daypart_date_exceptions"."start_minute" IS NULL AND "daypart_date_exceptions"."end_minute" IS NULL)
    OR
    ("daypart_date_exceptions"."kind" = 'override' AND "daypart_date_exceptions"."start_minute" >= 0 AND "daypart_date_exceptions"."start_minute" < 1440 AND "daypart_date_exceptions"."end_minute" > "daypart_date_exceptions"."start_minute" AND "daypart_date_exceptions"."end_minute" <= "daypart_date_exceptions"."start_minute" + 1440)
  )
);
--> statement-breakpoint
ALTER TABLE "daypart_date_exceptions" ADD CONSTRAINT "daypart_date_exceptions_daypart_id_dayparts_id_fk" FOREIGN KEY ("daypart_id") REFERENCES "public"."dayparts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daypart_date_exceptions" ADD CONSTRAINT "daypart_date_exceptions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daypart_date_exceptions_daypart_date_unique" ON "daypart_date_exceptions" USING btree ("daypart_id","service_date");--> statement-breakpoint
CREATE INDEX "daypart_date_exceptions_date_idx" ON "daypart_date_exceptions" USING btree ("service_date","daypart_id");--> statement-breakpoint
ALTER TABLE "daypart_date_exceptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "daypart_date_exceptions" FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT ("id", "daypart_id", "service_date", "kind", "start_minute", "end_minute") ON "daypart_date_exceptions" TO authenticated;--> statement-breakpoint
CREATE POLICY "daypart_date_exceptions_read_membership" ON "daypart_date_exceptions"
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1
  FROM public.dayparts AS daypart
  WHERE daypart.id = "daypart_id"
    AND daypart.residency_id IN (SELECT private.current_residency_ids())
));
