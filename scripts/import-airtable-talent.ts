import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parseAirtableTalentExport } from "../src/lib/airtable-talent";
import { encryptSensitiveField } from "../src/lib/field-encryption";

const MAX_W9_BYTES = 8 * 1024 * 1024;
const W9_CONTENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function attachmentExtension(filename: string, contentType: string) {
  const existing = extname(filename).toLowerCase().replace(/[^.a-z0-9]/g, "");
  if (existing && existing.length <= 8) return existing;
  if (contentType === "application/pdf") return ".pdf";
  if (contentType === "image/png") return ".png";
  if (contentType === "image/jpeg") return ".jpg";
  throw new Error(`Unsupported W-9 content type: ${contentType}`);
}

const inputPath = argument("--input");
if (!inputPath) throw new Error("Pass the Airtable Talent JSON export with --input.");
const apply = process.argv.includes("--apply");
const includeW9 = process.argv.includes("--include-w9");
const importedAt = new Date();
const inputJson = inputPath === "-"
  ? await (async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf8");
  })()
  : await readFile(inputPath, "utf8");
const records = parseAirtableTalentExport(JSON.parse(inputJson));
const w9Count = records.reduce((sum, record) => sum + record.w9Attachments.length, 0);
const achCount = records.filter((record) => record.payment.achAccountName || record.payment.achRoutingNumber || record.payment.achAccountNumber).length;
const rosterLabels = [...new Set(records.map((record) => record.airtableRosterStatusLabel || "(blank)"))].sort();
const talentLabels = [...new Set(records.map((record) => record.airtableTalentStatusLabel || "(blank)"))].sort();
const w9Types = [...new Set(records.flatMap((record) => record.w9Attachments.map((attachment) => attachment.type || "(blank)")))].sort();
const unsafeW9s = records.flatMap((record) => record.w9Attachments
  .filter((attachment) => !W9_CONTENT_TYPES.has(attachment.type))
  .map((attachment) => ({ airtableRecordId: record.airtableRecordId, type: attachment.type || "(blank)" })));

process.stdout.write(
  `Airtable Talent import plan: ${records.length} artists, ${records.filter((record) => record.talentStatus === "active").length} active, ${records.filter((record) => record.talentStatus === "inactive").length} inactive, ${achCount} ACH profiles, ${w9Count} W-9 attachments.\n`,
);
process.stdout.write(`Roster labels: ${rosterLabels.join(", ")}. Talent labels: ${talentLabels.join(", ")}.\n`);
process.stdout.write(`W-9 content types: ${w9Types.join(", ") || "none"}.\n`);
if (unsafeW9s.length) process.stdout.write(`Safety exception: ${unsafeW9s.length} attachment(s) will not be stored (${unsafeW9s.map((item) => `${item.airtableRecordId}:${item.type}`).join(", ")}).\n`);

if (!apply) {
  process.stdout.write("Dry run only. Re-run with --apply after reviewing the counts.\n");
  process.exit(0);
}

if (w9Count && !includeW9) {
  throw new Error("This export contains W-9 attachments. Re-run with --include-w9 after Storage backups are operational.");
}
if (includeW9 && process.env.STORAGE_BACKUP_CONFIRMED !== "1") {
  throw new Error("Set STORAGE_BACKUP_CONFIRMED=1 only after the encrypted Storage backup workflow has passed.");
}
if (achCount) requiredEnv("TALENT_PAYMENT_ENCRYPTION_KEY");

const actorEmail = process.env.IMPORT_ACTOR_EMAIL || "austyn@hearforyou.group";
const supabase = createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const actorResult = await supabase.from("users").select("id").ilike("email", actorEmail).limit(1).maybeSingle();
if (actorResult.error) throw new Error(`Could not load the import actor: ${actorResult.error.message}`);
if (!actorResult.data) throw new Error(`Import actor does not exist: ${actorEmail}`);
const actor = actorResult.data;

let created = 0;
let updated = 0;
let documentsImported = 0;
let documentsSkippedUnsafe = 0;

for (const record of records) {
  const existingResult = await supabase.from("talent").select("id")
    .eq("airtable_record_id", record.airtableRecordId).limit(1).maybeSingle();
  if (existingResult.error) throw new Error(`Could not check ${record.airtableRecordId}: ${existingResult.error.message}`);
  const existing = existingResult.data;
  const values = {
    airtable_record_id: record.airtableRecordId,
    stage_name: record.stageName,
    full_name: record.fullName,
    email: record.email,
    phone: record.phone,
    instagram_handle: record.instagramHandle,
    roster_status: record.rosterStatus,
    talent_status: record.talentStatus,
    home_market: record.homeMarket,
    genres: record.genres,
    priority: record.priority,
    talent_notes: record.talentNotes,
    legacy_outstanding_owed_cents: record.legacyOutstandingOwedCents,
    legacy_total_earnings_cents: record.legacyTotalEarningsCents,
    legacy_owed_from: record.legacyOwedFrom,
    legacy_upcoming_bookings: record.legacyUpcomingBookings,
    airtable_roster_status_label: record.airtableRosterStatusLabel,
    airtable_talent_status_label: record.airtableTalentStatusLabel,
    airtable_imported_at: importedAt.toISOString(),
    updated_at: importedAt.toISOString(),
  };
  const artistResult = await supabase.from("talent").upsert(values, { onConflict: "airtable_record_id" }).select("id").single();
  if (artistResult.error) throw new Error(`Could not import ${record.airtableRecordId}: ${artistResult.error.message}`);
  const artist = artistResult.data;
  if (existing) updated += 1;
  else created += 1;

  const paymentResult = await supabase.from("talent_payment_profiles").upsert({
    talent_id: artist.id,
    payment_method: record.payment.paymentMethod,
    zelle_email: record.payment.zelleEmail,
    zelle_phone: record.payment.zellePhone,
    ach_account_name_encrypted: encryptSensitiveField(record.payment.achAccountName),
    ach_routing_number_encrypted: encryptSensitiveField(record.payment.achRoutingNumber),
    ach_account_number_encrypted: encryptSensitiveField(record.payment.achAccountNumber),
    last_four: record.payment.lastFour,
    updated_at: importedAt.toISOString(),
  }, { onConflict: "talent_id" });
  if (paymentResult.error) throw new Error(`Could not import payment details for ${record.airtableRecordId}: ${paymentResult.error.message}`);

  if (includeW9) {
    for (const attachment of record.w9Attachments) {
      if (!W9_CONTENT_TYPES.has(attachment.type)) {
        documentsSkippedUnsafe += 1;
        continue;
      }
      if (attachment.size !== null && attachment.size > MAX_W9_BYTES) throw new Error(`W-9 is too large for ${record.airtableRecordId}.`);
      const storagePath = `airtable-import/${record.airtableRecordId}/${attachment.id}${attachmentExtension(attachment.filename, attachment.type)}`;
      const documentResult = await supabase.from("talent_documents").select("id")
        .eq("storage_path", storagePath).limit(1).maybeSingle();
      if (documentResult.error) throw new Error(`Could not check W-9 state for ${record.airtableRecordId}: ${documentResult.error.message}`);
      if (documentResult.data) continue;
      const response = await fetch(attachment.url, { redirect: "follow" });
      if (!response.ok) throw new Error(`Could not download a W-9 for ${record.airtableRecordId}.`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length <= 0 || bytes.length > MAX_W9_BYTES) throw new Error(`W-9 size is invalid for ${record.airtableRecordId}.`);
      const uploaded = await supabase.storage.from("talent-documents").upload(storagePath, bytes, {
        contentType: attachment.type,
        cacheControl: "31536000",
        upsert: false,
      });
      if (uploaded.error) throw new Error(`Could not store a W-9 for ${record.airtableRecordId}: ${uploaded.error.message}`);
      try {
        const inserted = await supabase.from("talent_documents").insert({
          talent_id: artist.id,
          kind: "W-9",
          storage_path: storagePath,
          content_type: attachment.type,
          uploaded_by_user_id: actor.id,
        });
        if (inserted.error) throw new Error(inserted.error.message);
        documentsImported += 1;
      } catch (error) {
        await supabase.storage.from("talent-documents").remove([storagePath]);
        throw error;
      }
    }
  }

  const auditResult = await supabase.from("audit_log").insert({
    actor_user_id: actor.id,
    actor_label: actorEmail,
    action: existing ? "talent_airtable_reimported" : "talent_airtable_imported",
    entity_type: "talent",
    entity_id: artist.id,
    details: {
      airtableRecordId: record.airtableRecordId,
      talentStatus: record.talentStatus,
      rosterStatus: record.rosterStatus,
      w9AttachmentCount: record.w9Attachments.length,
      w9SkippedUnsafeCount: record.w9Attachments.filter((attachment) => !W9_CONTENT_TYPES.has(attachment.type)).length,
    },
  });
  if (auditResult.error) throw new Error(`Could not audit ${record.airtableRecordId}: ${auditResult.error.message}`);
}

process.stdout.write(
  `Airtable Talent import complete: ${created} created, ${updated} updated, ${documentsImported} W-9 documents stored, ${documentsSkippedUnsafe} unsafe attachment(s) skipped.\n`,
);
