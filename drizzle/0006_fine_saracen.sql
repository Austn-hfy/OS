ALTER TABLE "invoices" ADD COLUMN "pdf_source_hash" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "pdf_sha256" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "pdf_generated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "pdf_generated_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "pdf_byte_size" integer;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "pdf_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_pdf_generated_by_user_id_users_id_fk" FOREIGN KEY ("pdf_generated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_pdf_size_positive" CHECK ("invoices"."pdf_byte_size" IS NULL OR "invoices"."pdf_byte_size" > 0);