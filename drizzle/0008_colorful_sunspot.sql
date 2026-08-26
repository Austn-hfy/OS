CREATE TYPE "public"."invoice_kind" AS ENUM('scheduled_period', 'custom');--> statement-breakpoint
CREATE TYPE "public"."invoice_line_presentation" AS ENUM('service_detail', 'daily_summary', 'period_summary');--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN "service_date" date;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN "unit_label" text DEFAULT 'item' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "kind" "invoice_kind" DEFAULT 'scheduled_period' NOT NULL;--> statement-breakpoint
ALTER TABLE "residencies" ADD COLUMN "billing_cycle_start_weekday" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "residencies" ADD COLUMN "billing_cycle_length_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "residencies" ADD COLUMN "invoice_line_presentation" "invoice_line_presentation" DEFAULT 'service_detail' NOT NULL;--> statement-breakpoint
ALTER TABLE "residencies" ADD COLUMN "default_invoice_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "residencies" ADD CONSTRAINT "residencies_billing_cycle_valid" CHECK ("residencies"."billing_cycle_start_weekday" >= 0 AND "residencies"."billing_cycle_start_weekday" <= 6 AND "residencies"."billing_cycle_length_days" >= 1 AND "residencies"."billing_cycle_length_days" <= 31);--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_no_overlapping_active_periods";--> statement-breakpoint
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_no_overlapping_active_periods"
  EXCLUDE USING gist (
    "residency_id" WITH =,
    daterange("billing_period_start", "billing_period_end", '[]') WITH &&
  ) WHERE ("status" <> 'void' AND "kind" = 'scheduled_period');
