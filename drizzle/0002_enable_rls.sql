-- The application performs all business-data access on the server through the
-- Postgres connection. Supabase browser clients are used for Auth only. Enabling
-- RLS without client policies makes direct anon/authenticated PostgREST access
-- deny-by-default, so a hotel cannot bypass the server's Residency scope.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "residencies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "residency_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "talent" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "talent_onboarding_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "talent_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "talent_payment_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "residency_talent" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shifts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attention_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "automation_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
