UPDATE "talent" SET "genres" = ARRAY['Electronic/House']::text[], "updated_at" = now();--> statement-breakpoint
UPDATE "talent_onboarding_submissions" SET "genres" = ARRAY['Electronic/House']::text[];--> statement-breakpoint
ALTER TABLE "talent" ADD CONSTRAINT "talent_genres_standardized" CHECK (cardinality("talent"."genres") BETWEEN 1 AND 3 AND "talent"."genres" <@ ARRAY['Electronic/House', 'Open Format', 'Vinyl']::text[]);--> statement-breakpoint
ALTER TABLE "talent_onboarding_submissions" ADD CONSTRAINT "talent_onboarding_genres_standardized" CHECK (cardinality("talent_onboarding_submissions"."genres") BETWEEN 1 AND 3 AND "talent_onboarding_submissions"."genres" <@ ARRAY['Electronic/House', 'Open Format', 'Vinyl']::text[]);
