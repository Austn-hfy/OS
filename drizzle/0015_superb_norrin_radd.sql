CREATE TABLE "public_calendar_links" (
	"residency_id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"rotated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_calendar_links_token_hash_valid" CHECK ("public_calendar_links"."token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "public_calendar_links" ADD CONSTRAINT "public_calendar_links_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_calendar_links" ADD CONSTRAINT "public_calendar_links_rotated_by_user_id_users_id_fk" FOREIGN KEY ("rotated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "public_calendar_links_token_hash_unique" ON "public_calendar_links" USING btree ("token_hash");--> statement-breakpoint
ALTER TABLE "public_calendar_links" ENABLE ROW LEVEL SECURITY;
