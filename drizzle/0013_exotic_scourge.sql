ALTER TABLE "talent" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "talent_visibility_idx" ON "talent" USING btree ("archived_at","talent_status");