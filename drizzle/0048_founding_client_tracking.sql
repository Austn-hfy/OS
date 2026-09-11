ALTER TABLE "residencies"
  ADD COLUMN "founding_client_signed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "residencies"
  ADD COLUMN "founding_client_ends_at" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "residencies"
  ADD CONSTRAINT "residencies_founding_client_window_complete" CHECK (
    ("residencies"."founding_client_signed_at" IS NULL AND "residencies"."founding_client_ends_at" IS NULL)
    OR ("residencies"."founding_client_signed_at" IS NOT NULL AND "residencies"."founding_client_ends_at" IS NOT NULL)
  );--> statement-breakpoint
ALTER TABLE "residencies"
  ADD CONSTRAINT "residencies_founding_client_eligible" CHECK (
    "residencies"."founding_client_signed_at" IS NULL
    OR "residencies"."founding_client_signed_at" < '2027-08-01T00:00:00.000Z'::timestamptz
  );--> statement-breakpoint
ALTER TABLE "residencies"
  ADD CONSTRAINT "residencies_founding_client_dates_valid" CHECK (
    "residencies"."founding_client_signed_at" IS NULL
    OR "residencies"."founding_client_ends_at" > "residencies"."founding_client_signed_at"
  );
