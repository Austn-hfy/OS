CREATE TYPE "public"."invitation_status" AS ENUM('not_invited', 'invited', 'active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."residency_access_role" AS ENUM('manager', 'calendar_viewer');--> statement-breakpoint
CREATE TABLE "residency_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"residency_id" uuid NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"access_role" "residency_access_role",
	"invitation_status" "invitation_status" DEFAULT 'not_invited' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"invited_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "residency_memberships" ADD COLUMN "access_role" "residency_access_role" DEFAULT 'manager' NOT NULL;--> statement-breakpoint
ALTER TABLE "residency_contacts" ADD CONSTRAINT "residency_contacts_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residency_contacts" ADD CONSTRAINT "residency_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "residency_contacts_residency_idx" ON "residency_contacts" USING btree ("residency_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "residency_contacts_residency_email_unique" ON "residency_contacts" USING btree ("residency_id",lower("email")) WHERE "residency_contacts"."email" <> '';
--> statement-breakpoint
ALTER TABLE "residency_contacts" ENABLE ROW LEVEL SECURITY;
