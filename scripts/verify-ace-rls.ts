import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const url = required("NEXT_PUBLIC_SUPABASE_URL");
const publishableKey = required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const sql = postgres(required("DATABASE_URL"), { prepare: false, max: 1 });
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const createdUserIds: string[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function createTestActor(email: string, residencyId: string) {
  const password = `Hfy-Rls-${randomBytes(18).toString("base64url")}!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error("Could not create RLS test user.");
  createdUserIds.push(created.data.user.id);
  await sql`INSERT INTO users (id, email, display_name, role) VALUES (${created.data.user.id}, ${email}, 'RLS Verification', 'hotel_user')`;
  await sql`INSERT INTO residency_memberships (user_id, residency_id, access_role, active) VALUES (${created.data.user.id}, ${residencyId}, 'manager', true)`;
  const client = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  return client;
}

try {
  const residencyRows = await sql<{ id: string; name: string }[]>`SELECT id, name FROM residencies WHERE active = true AND operating_mode = 'operations' ORDER BY created_at`;
  const ace = residencyRows.find((row) => row.name.toLowerCase().startsWith("ace hotel"));
  const other = residencyRows.find((row) => row.id !== ace?.id);
  assert(ace, "Ace Residency was not found.");
  assert(other, "A second Residency is required to prove cross-Residency denial.");
  const marker = Date.now();
  const aceClient = await createTestActor(`rls-ace-${marker}@example.invalid`, ace.id);
  const otherClient = await createTestActor(`rls-other-${marker}@example.invalid`, other.id);

  const aceResidencies = await aceClient.from("residencies").select("id,name");
  assert(!aceResidencies.error, `Ace safe Residency query failed: ${aceResidencies.error?.message}`);
  assert(aceResidencies.data?.length === 1 && aceResidencies.data[0]?.id === ace.id, "Ace actor could see a Residency outside Ace.");
  const otherResidencies = await otherClient.from("residencies").select("id,name");
  assert(!otherResidencies.error, `Other safe Residency query failed: ${otherResidencies.error?.message}`);
  assert(otherResidencies.data?.length === 1 && otherResidencies.data[0]?.id === other.id, "Other actor could see Ace.");

  const aceDayparts = await aceClient.from("dayparts").select("id,residency_id,name");
  assert(!aceDayparts.error, `Ace Daypart query failed: ${aceDayparts.error?.message}`);
  assert(aceDayparts.data?.every((row) => row.residency_id === ace.id), "Ace actor could retrieve another Residency's Daypart.");
  const otherDaypartIds = (await sql<{ id: string }[]>`SELECT id FROM dayparts WHERE residency_id = ${other.id}`).map((row) => row.id);
  assert(!aceDayparts.data?.some((row) => otherDaypartIds.includes(row.id)), "Ace actor retrieved a known foreign Daypart.");

  const forbiddenRate = await aceClient.from("residencies").select("id,default_talent_rate_cents");
  assert(Boolean(forbiddenRate.error), "Ace actor could retrieve a Residency rate column.");
  const forbiddenInvoice = await aceClient.from("invoices").select("id,residency_id");
  assert(Boolean(forbiddenInvoice.error), "Ace actor could retrieve Invoice data.");
  const forbiddenPayment = await aceClient.from("talent_payment_profiles").select("talent_id,last_four");
  assert(Boolean(forbiddenPayment.error), "Ace actor could retrieve Talent payment data.");
  const forbiddenTalentContact = await aceClient.from("talent").select("id,email,phone");
  assert(Boolean(forbiddenTalentContact.error), "Ace actor could retrieve Talent contact data.");
  const forbiddenWrite = await aceClient.from("dayparts").update({ name: "RLS should reject" }).eq("residency_id", other.id);
  assert(Boolean(forbiddenWrite.error), "Ace actor could mutate a foreign Daypart through the Data API.");

  process.stdout.write(JSON.stringify({
    passed: true,
    checks: [
      "Ace reads only Ace Residency",
      "other Residency cannot read Ace",
      "Dayparts are Residency-scoped",
      "rate columns denied",
      "Invoices denied",
      "payment profiles denied",
      "Talent contact fields denied",
      "Data API writes denied",
    ],
  }, null, 2));
} finally {
  for (const userId of createdUserIds) {
    await sql`DELETE FROM residency_memberships WHERE user_id = ${userId}`;
    await sql`DELETE FROM users WHERE id = ${userId}`;
    await admin.auth.admin.deleteUser(userId);
  }
  await sql.end();
}
