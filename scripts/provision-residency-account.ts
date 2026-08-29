import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { auditLog, residencies, residencyContacts, residencyMemberships, users } from "../src/db/schema";

function argument(name: string, required = true): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : "";
  if (required && !value) throw new Error(`--${name} is required.`);
  return value;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const email = argument("email").trim().toLocaleLowerCase();
const displayName = argument("name").trim();
const residencyId = argument("residency-id");
const title = argument("title", false).trim() || "Residency Manager";
const isInternalTest = process.argv.includes("--internal-test");
if (!email.includes("@")) throw new Error("--email must be valid.");

const supabase = createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const sqlClient = postgres(requiredEnv("DATABASE_URL"), { prepare: false, max: 1 });
const database = drizzle(sqlClient);
let createdAuthUserId: string | null = null;

try {
  const [residency] = await database.select({ id: residencies.id, name: residencies.name }).from(residencies).where(and(
    eq(residencies.id, residencyId),
    eq(residencies.active, true),
    eq(residencies.operatingMode, "operations"),
  )).limit(1);
  if (!residency) throw new Error("The requested active Residency does not exist.");

  const { data: listed, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1_000 });
  if (listError) throw listError;
  let authUser = listed.users.find((user) => user.email?.toLocaleLowerCase() === email) ?? null;
  if (!authUser) {
    const password = `${randomBytes(32).toString("base64url")}!Aa1`;
    const created = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (created.error || !created.data.user) throw created.error ?? new Error("Supabase account creation failed.");
    authUser = created.data.user;
    createdAuthUserId = authUser.id;
  }

  await database.transaction(async (tx) => {
    const [localByEmail] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (localByEmail && localByEmail.id !== authUser.id) throw new Error("The local account email belongs to a different authentication user.");
    await tx.insert(users).values({
      id: authUser.id,
      email,
      displayName,
      role: "hotel_user",
      isInternalTest,
      active: true,
    }).onConflictDoUpdate({
      target: users.id,
      set: { email, displayName, role: "hotel_user", isInternalTest, active: true, updatedAt: new Date() },
    });
    await tx.insert(residencyMemberships).values({
      userId: authUser.id,
      residencyId: residency.id,
      accessRole: "manager",
      active: true,
    }).onConflictDoUpdate({
      target: [residencyMemberships.userId, residencyMemberships.residencyId],
      set: { accessRole: "manager", active: true },
    });

    const [existingContact] = await tx.select({ id: residencyContacts.id }).from(residencyContacts).where(and(
      eq(residencyContacts.residencyId, residency.id),
      eq(residencyContacts.email, email),
    )).limit(1);
    const contactValues = {
      userId: authUser.id,
      name: displayName,
      title,
      email,
      accessRole: "manager" as const,
      invitationStatus: "active" as const,
      active: true,
      acceptedAt: new Date(),
      updatedAt: new Date(),
    };
    const [contact] = existingContact
      ? await tx.update(residencyContacts).set(contactValues).where(eq(residencyContacts.id, existingContact.id)).returning({ id: residencyContacts.id })
      : await tx.insert(residencyContacts).values({ residencyId: residency.id, ...contactValues }).returning({ id: residencyContacts.id });

    await tx.insert(auditLog).values({
      residencyId: residency.id,
      actorLabel: "secure production provisioning",
      action: isInternalTest ? "internal_test_account_provisioned" : "residency_account_provisioned",
      entityType: "residency_contact",
      entityId: contact.id,
      details: { userId: authUser.id, email, accessRole: "manager", isInternalTest },
    });
  });

  process.stdout.write(`Provisioned ${isInternalTest ? "internal test" : "customer"} access for ${email} in ${residency.name}. No email was sent.\n`);
} catch (error) {
  if (createdAuthUserId) await supabase.auth.admin.deleteUser(createdAuthUserId);
  throw error;
} finally {
  await sqlClient.end();
}
