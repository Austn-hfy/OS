import { createClient } from "@supabase/supabase-js";
import { parseAirtableTalentExport } from "../src/lib/airtable-talent";
import { decryptSensitiveField } from "../src/lib/field-encryption";

const SAFE_W9_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
const sourceRecords = parseAirtableTalentExport(JSON.parse(Buffer.concat(chunks).toString("utf8")));
const supabase = createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const artistsResult = await supabase.from("talent").select("id,airtable_record_id,stage_name,full_name,email,phone,instagram_handle,roster_status,talent_status,home_market,genres,priority,talent_notes,legacy_outstanding_owed_cents,legacy_total_earnings_cents,legacy_owed_from,legacy_upcoming_bookings,airtable_roster_status_label,airtable_talent_status_label,airtable_payment_details,airtable_imported_at");
if (artistsResult.error) throw new Error(`Could not read imported artists: ${artistsResult.error.message}`);
const artists = artistsResult.data;
const artistIds = artists.map((artist) => artist.id);

const paymentsResult = artistIds.length
  ? await supabase.from("talent_payment_profiles").select("*").in("talent_id", artistIds)
  : { data: [], error: null };
if (paymentsResult.error) throw new Error(`Could not read imported payment profiles: ${paymentsResult.error.message}`);
const documentsResult = artistIds.length
  ? await supabase.from("talent_documents").select("talent_id,kind,storage_path,content_type").in("talent_id", artistIds)
  : { data: [], error: null };
if (documentsResult.error) throw new Error(`Could not read imported documents: ${documentsResult.error.message}`);

const errors: string[] = [];
const checkedStageNames: string[] = [];
const spotIndexes = new Set([0, Math.floor(sourceRecords.length / 3), Math.floor(sourceRecords.length * 2 / 3), sourceRecords.length - 1]);

function sameStrings(left: unknown, right: unknown) {
  return String(left ?? "") === String(right ?? "");
}

for (const [index, source] of sourceRecords.entries()) {
  const artist = artists.find((item) => item.airtable_record_id === source.airtableRecordId);
  if (!artist) {
    errors.push(`${source.airtableRecordId}: missing Talent row`);
    continue;
  }
  const checks: Array<[string, unknown, unknown]> = [
    ["stage name", artist.stage_name, source.stageName],
    ["full name", artist.full_name, source.fullName],
    ["email", artist.email, source.email],
    ["phone", artist.phone, source.phone],
    ["Instagram", artist.instagram_handle, source.instagramHandle],
    ["roster status", artist.roster_status, source.rosterStatus],
    ["talent status", artist.talent_status, source.talentStatus],
    ["home market", artist.home_market, source.homeMarket],
    ["priority", artist.priority, source.priority],
    ["notes", artist.talent_notes, source.talentNotes],
    ["outstanding owed", artist.legacy_outstanding_owed_cents, source.legacyOutstandingOwedCents],
    ["all-time earnings", artist.legacy_total_earnings_cents, source.legacyTotalEarningsCents],
    ["owed from", artist.legacy_owed_from, source.legacyOwedFrom],
    ["upcoming bookings", artist.legacy_upcoming_bookings, source.legacyUpcomingBookings],
    ["Airtable roster label", artist.airtable_roster_status_label, source.airtableRosterStatusLabel],
    ["Airtable talent label", artist.airtable_talent_status_label, source.airtableTalentStatusLabel],
    ["Airtable payment summary", artist.airtable_payment_details, source.airtablePaymentDetails],
  ];
  for (const [field, actual, expected] of checks) {
    if (!sameStrings(actual, expected)) errors.push(`${source.airtableRecordId}: ${field} mismatch`);
  }
  if (JSON.stringify(artist.genres ?? []) !== JSON.stringify(source.genres)) errors.push(`${source.airtableRecordId}: genres mismatch`);
  if (!artist.airtable_imported_at) errors.push(`${source.airtableRecordId}: missing import timestamp`);

  const payment = paymentsResult.data.find((item) => item.talent_id === artist.id);
  if (!payment) errors.push(`${source.airtableRecordId}: missing payment profile`);
  else {
    const paymentChecks: Array<[string, unknown, unknown]> = [
      ["payment method", payment.payment_method, source.payment.paymentMethod],
      ["Zelle email", payment.zelle_email, source.payment.zelleEmail],
      ["Zelle phone", payment.zelle_phone, source.payment.zellePhone],
      ["ACH last four", payment.last_four, source.payment.lastFour],
      ["ACH account name", decryptSensitiveField(payment.ach_account_name_encrypted), source.payment.achAccountName],
      ["ACH routing number", decryptSensitiveField(payment.ach_routing_number_encrypted), source.payment.achRoutingNumber],
      ["ACH account number", decryptSensitiveField(payment.ach_account_number_encrypted), source.payment.achAccountNumber],
    ];
    for (const [field, actual, expected] of paymentChecks) {
      if (!sameStrings(actual, expected)) errors.push(`${source.airtableRecordId}: ${field} mismatch`);
    }
  }

  const expectedSafeW9Count = source.w9Attachments.filter((attachment) => SAFE_W9_TYPES.has(attachment.type)).length;
  const actualW9Count = documentsResult.data.filter((document) => document.talent_id === artist.id && document.kind === "W-9").length;
  if (actualW9Count !== expectedSafeW9Count) errors.push(`${source.airtableRecordId}: W-9 count mismatch`);
  if (spotIndexes.has(index)) checkedStageNames.push(source.stageName);
}

if (artists.length !== sourceRecords.length) errors.push(`Production contains ${artists.length} Talent rows; Airtable contains ${sourceRecords.length}`);
if (errors.length) {
  process.stderr.write(`Talent verification failed with ${errors.length} mismatch(es):\n${errors.join("\n")}\n`);
  process.exit(1);
}

const safeW9Count = sourceRecords.reduce((sum, record) => sum + record.w9Attachments.filter((attachment) => SAFE_W9_TYPES.has(attachment.type)).length, 0);
const unsafeW9Count = sourceRecords.reduce((sum, record) => sum + record.w9Attachments.filter((attachment) => !SAFE_W9_TYPES.has(attachment.type)).length, 0);
process.stdout.write(`Verified ${sourceRecords.length}/${sourceRecords.length} Airtable artists against production across identity, contact, status, market, genres, notes, financial snapshots, decrypted payment values, and documents.\n`);
process.stdout.write(`Production document check: ${safeW9Count} safe W-9 files present; ${unsafeW9Count} unsafe Airtable attachment intentionally absent.\n`);
process.stdout.write(`Direct spot-check set: ${checkedStageNames.join(", ")}.\n`);
