import { eq } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { residencyMemberships, residencies, users } from "../src/db/schema";

function argument(name: string, required = true): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : "";
  if (required && !value) throw new Error(`--${name} is required.`);
  return value;
}

const email = argument("email").trim().toLowerCase();
const password = argument("password");
const displayName = argument("name").trim();
const role = argument("role") as "internal_admin" | "hotel_user";
const residencySlug = argument("residency", role === "hotel_user");
if (!email.includes("@")) throw new Error("--email must be valid.");
if (password.length < 12) throw new Error("--password must be at least 12 characters.");
if (!(["internal_admin", "hotel_user"] as const).includes(role)) throw new Error("--role must be internal_admin or hotel_user.");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;
if (!supabaseUrl || !serviceRoleKey || !databaseUrl) throw new Error("Supabase and DATABASE_URL environment variables are required.");

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: displayName } });
if (created.error || !created.data.user) throw created.error ?? new Error("Supabase user creation failed.");

const sqlClient = postgres(databaseUrl, { prepare: false, max: 1 });
const database = drizzle(sqlClient);
try {
  await database.transaction(async (tx) => {
    await tx.insert(users).values({ id: created.data.user.id, email, displayName, role });
    if (role === "hotel_user") {
      const [residency] = await tx.select({ id: residencies.id }).from(residencies).where(eq(residencies.slug, residencySlug)).limit(1);
      if (!residency) throw new Error(`Residency ${residencySlug} does not exist.`);
      await tx.insert(residencyMemberships).values({ userId: created.data.user.id, residencyId: residency.id });
    }
  });
} catch (error) {
  await supabase.auth.admin.deleteUser(created.data.user.id);
  throw error;
} finally {
  await sqlClient.end();
}

process.stdout.write(`Provisioned ${role} login for ${email}${residencySlug ? ` at ${residencySlug}` : ""}.\n`);
