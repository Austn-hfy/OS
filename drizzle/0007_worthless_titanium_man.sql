CREATE TABLE "platform_settings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_name" text DEFAULT 'Hear For You' NOT NULL,
	"billing_email" text DEFAULT 'billing@hearforyou.group' NOT NULL,
	"billing_address" text DEFAULT '' NOT NULL,
	"invoice_logo_storage_path" text,
	"invoice_logo_content_type" text,
	"invoice_logo_sha256" text,
	"invoice_logo_byte_size" integer,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_settings_logo_metadata_complete" CHECK (
    ("platform_settings"."invoice_logo_storage_path" IS NULL AND "platform_settings"."invoice_logo_content_type" IS NULL AND "platform_settings"."invoice_logo_sha256" IS NULL AND "platform_settings"."invoice_logo_byte_size" IS NULL)
    OR
    ("platform_settings"."invoice_logo_storage_path" IS NOT NULL AND "platform_settings"."invoice_logo_content_type" IN ('image/png', 'image/jpeg', 'image/webp') AND "platform_settings"."invoice_logo_sha256" IS NOT NULL AND "platform_settings"."invoice_logo_byte_size" > 0)
  )
);
--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_settings" ENABLE ROW LEVEL SECURITY;
