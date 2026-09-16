CREATE TABLE "migration_session_fallback_verification" (
	"id" integer PRIMARY KEY
);
--> statement-breakpoint
-- ALLOW-DESTRUCTIVE
DROP TABLE "migration_session_fallback_verification";
