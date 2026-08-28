CREATE TABLE "public_calendar_link_dayparts" (
	"residency_id" uuid NOT NULL,
	"daypart_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_calendar_link_dayparts_residency_id_daypart_id_pk" PRIMARY KEY("residency_id","daypart_id")
);
--> statement-breakpoint
ALTER TABLE "public_calendar_links" ADD COLUMN "scope" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "public_calendar_link_dayparts" ADD CONSTRAINT "public_calendar_link_dayparts_residency_id_public_calendar_links_residency_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."public_calendar_links"("residency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_calendar_link_dayparts" ADD CONSTRAINT "public_calendar_link_dayparts_daypart_id_dayparts_id_fk" FOREIGN KEY ("daypart_id") REFERENCES "public"."dayparts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "public_calendar_link_dayparts_daypart_idx" ON "public_calendar_link_dayparts" USING btree ("daypart_id");--> statement-breakpoint
ALTER TABLE "public_calendar_links" ADD CONSTRAINT "public_calendar_links_scope_valid" CHECK ("public_calendar_links"."scope" IN ('all', 'selected'));--> statement-breakpoint
ALTER TABLE "public_calendar_link_dayparts" ENABLE ROW LEVEL SECURITY;
