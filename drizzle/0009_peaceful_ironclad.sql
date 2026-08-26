CREATE TYPE "public"."lead_source" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."operating_mode" AS ENUM('pipeline', 'operations');--> statement-breakpoint
CREATE TYPE "public"."pipeline_status" AS ENUM('contacted', 'call_scheduled', 'call_complete', 'discovery_scheduled', 'discovery_complete', 'proposal_sent', 'won', 'lost');--> statement-breakpoint
ALTER TABLE "residencies" ADD COLUMN "operating_mode" "operating_mode" DEFAULT 'operations' NOT NULL;--> statement-breakpoint
ALTER TABLE "residencies" ADD COLUMN "primary_contact_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "residencies" ADD COLUMN "primary_contact_phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "residencies" ADD COLUMN "primary_contact_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "residencies" ADD COLUMN "lead_source" "lead_source";--> statement-breakpoint
ALTER TABLE "residencies" ADD COLUMN "pipeline_status" "pipeline_status" DEFAULT 'contacted' NOT NULL;--> statement-breakpoint
ALTER TABLE "residencies" ADD COLUMN "pipeline_status_changed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "residencies" ADD COLUMN "lead_notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "residencies" ADD COLUMN "converted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "residencies_pipeline_status_idx" ON "residencies" USING btree ("operating_mode","pipeline_status","pipeline_status_changed_at");