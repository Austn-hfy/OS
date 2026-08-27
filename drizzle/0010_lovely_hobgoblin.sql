ALTER TABLE "talent" ADD COLUMN "airtable_record_id" text;--> statement-breakpoint
ALTER TABLE "talent" ADD COLUMN "legacy_outstanding_owed_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "talent" ADD COLUMN "legacy_total_earnings_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "talent" ADD COLUMN "legacy_owed_from" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "talent" ADD COLUMN "legacy_upcoming_bookings" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "talent" ADD COLUMN "airtable_imported_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "talent_airtable_record_id_unique" ON "talent" USING btree ("airtable_record_id");--> statement-breakpoint
ALTER TABLE "talent" ADD CONSTRAINT "talent_legacy_financials_nonnegative" CHECK ("talent"."legacy_outstanding_owed_cents" >= 0 AND "talent"."legacy_total_earnings_cents" >= 0);