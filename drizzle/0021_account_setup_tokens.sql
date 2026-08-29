CREATE TABLE "account_setup_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"residency_id" uuid,
	"contact_id" uuid,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_setup_tokens_hash_valid" CHECK ("account_setup_tokens"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "account_setup_tokens_expiry_valid" CHECK ("account_setup_tokens"."expires_at" > "account_setup_tokens"."created_at"),
	CONSTRAINT "account_setup_tokens_terminal_state_valid" CHECK (NOT ("account_setup_tokens"."used_at" IS NOT NULL AND "account_setup_tokens"."revoked_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "account_setup_tokens" ADD CONSTRAINT "account_setup_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_setup_tokens" ADD CONSTRAINT "account_setup_tokens_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_setup_tokens" ADD CONSTRAINT "account_setup_tokens_contact_id_residency_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."residency_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_setup_tokens" ADD CONSTRAINT "account_setup_tokens_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_setup_tokens_hash_unique" ON "account_setup_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "account_setup_tokens_one_active_per_user" ON "account_setup_tokens" USING btree ("user_id") WHERE "account_setup_tokens"."used_at" IS NULL AND "account_setup_tokens"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "account_setup_tokens_user_idx" ON "account_setup_tokens" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "account_setup_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "account_setup_tokens" FROM anon, authenticated;
