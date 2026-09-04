ALTER TABLE "public_calendar_links" ADD COLUMN "id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "public_calendar_links" ADD COLUMN "name" text DEFAULT 'Existing calendar link' NOT NULL;--> statement-breakpoint
ALTER TABLE "public_calendar_links" ADD COLUMN "token_ciphertext" text;--> statement-breakpoint
ALTER TABLE "public_calendar_links" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "public_calendar_links" ADD COLUMN "updated_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "public_calendar_links" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "public_calendar_links" ADD COLUMN "revoked_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "public_calendar_links" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "public_calendar_links"
SET
	"created_by_user_id" = "rotated_by_user_id",
	"updated_by_user_id" = "rotated_by_user_id",
	"updated_at" = "rotated_at";--> statement-breakpoint
ALTER TABLE "public_calendar_link_dayparts" ADD COLUMN "link_id" uuid;--> statement-breakpoint
UPDATE "public_calendar_link_dayparts" AS selections
SET "link_id" = links."id"
FROM "public_calendar_links" AS links
WHERE links."residency_id" = selections."residency_id";--> statement-breakpoint
ALTER TABLE "public_calendar_link_dayparts" ALTER COLUMN "link_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "public_calendar_link_dayparts" DROP CONSTRAINT "public_calendar_link_dayparts_residency_id_public_calendar_links_residency_id_fk";--> statement-breakpoint
ALTER TABLE "public_calendar_link_dayparts" DROP CONSTRAINT "public_calendar_link_dayparts_daypart_id_dayparts_id_fk";--> statement-breakpoint
ALTER TABLE "public_calendar_link_dayparts" DROP CONSTRAINT "public_calendar_link_dayparts_residency_id_daypart_id_pk";--> statement-breakpoint
ALTER TABLE "public_calendar_links" DROP CONSTRAINT "public_calendar_links_pkey";--> statement-breakpoint
ALTER TABLE "public_calendar_links" ADD CONSTRAINT "public_calendar_links_pkey" PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "public_calendar_link_dayparts" ADD CONSTRAINT "public_calendar_link_dayparts_link_id_daypart_id_pk" PRIMARY KEY("link_id", "daypart_id");--> statement-breakpoint
ALTER TABLE "public_calendar_links" ADD CONSTRAINT "public_calendar_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_calendar_links" ADD CONSTRAINT "public_calendar_links_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_calendar_links" ADD CONSTRAINT "public_calendar_links_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "public_calendar_links_id_residency_unique" ON "public_calendar_links" USING btree ("id", "residency_id");--> statement-breakpoint
ALTER TABLE "public_calendar_link_dayparts" ADD CONSTRAINT "public_calendar_link_dayparts_link_residency_fk" FOREIGN KEY ("link_id", "residency_id") REFERENCES "public"."public_calendar_links"("id", "residency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_calendar_link_dayparts" ADD CONSTRAINT "public_calendar_link_dayparts_daypart_residency_fk" FOREIGN KEY ("daypart_id", "residency_id") REFERENCES "public"."dayparts"("id", "residency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "public_calendar_link_dayparts_residency_idx" ON "public_calendar_link_dayparts" USING btree ("residency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "public_calendar_links_active_name_unique" ON "public_calendar_links" USING btree ("residency_id", lower(btrim("name"))) WHERE "public_calendar_links"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "public_calendar_links_residency_status_idx" ON "public_calendar_links" USING btree ("residency_id", "revoked_at", "created_at");--> statement-breakpoint
ALTER TABLE "public_calendar_links" ADD CONSTRAINT "public_calendar_links_name_not_blank" CHECK (length(btrim("public_calendar_links"."name")) > 0);--> statement-breakpoint
ALTER TABLE "public_calendar_links" ADD CONSTRAINT "public_calendar_links_name_length" CHECK (length("public_calendar_links"."name") <= 80);--> statement-breakpoint
ALTER TABLE "public_calendar_links" ADD CONSTRAINT "public_calendar_links_token_ciphertext_valid" CHECK ("public_calendar_links"."token_ciphertext" IS NULL OR "public_calendar_links"."token_ciphertext" LIKE 'v1:%');--> statement-breakpoint
ALTER TABLE "public_calendar_links" ALTER COLUMN "name" DROP DEFAULT;
