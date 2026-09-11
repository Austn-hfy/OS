ALTER TABLE "residencies"
  ADD COLUMN "comped" boolean DEFAULT false NOT NULL;--> statement-breakpoint

ALTER TABLE "residencies"
  ADD CONSTRAINT "residencies_comped_not_founding" CHECK (
    NOT "residencies"."comped"
    OR (
      "residencies"."founding_client_signed_at" IS NULL
      AND "residencies"."founding_client_ends_at" IS NULL
    )
  );
