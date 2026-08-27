ALTER TABLE "talent" ADD COLUMN "airtable_roster_status_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "talent" ADD COLUMN "airtable_talent_status_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "talent" ADD COLUMN "airtable_payment_details" text DEFAULT '' NOT NULL;