DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hfy_app') THEN
    CREATE ROLE hfy_app NOLOGIN;
  END IF;
END
$$;--> statement-breakpoint

GRANT USAGE ON SCHEMA private TO hfy_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.hfy_staging_structure_snapshot(text) TO hfy_app;
