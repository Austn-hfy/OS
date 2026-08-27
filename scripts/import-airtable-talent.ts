import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { auditLog, talent, talentDocuments, talentPaymentProfiles, users } from "../src/db/schema";
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
const records = parseAirtableTalentExport(JSON.parse(await readFile(inputPath, "utf8")));
const w9Count = records.reduce((sum, record) => sum + record.w9Attachments.length, 0);
const achCount = records.filter((record) => record.payment.achAccountName || record.payment.achRoutingNumber || record.payment.achAccountNumber).length;

process.stdout.write(
  `Airtable Talent import plan: ${records.length} artists, ${records.filter((record) => record.talentStatus === "active").length} active, ${records.filter((record) => record.talentStatus === "inactive").length} inactive, ${achCount} ACH profiles, ${w9Count} W-9 attachments.\n`,
);

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

const database = getDb();
const actorEmail = process.env.IMPORT_ACTOR_EMAIL || "austyn@hearforyou.group";
const [actor] = await database.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = lower(${actorEmail})`).limit(1);
if (!actor) throw new Error(`Import actor does not exist: ${actorEmail}`);

const supabase = includeW9 ? createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
}) : null;

let created = 0;
let updated = 0;
let documentsImported = 0;

for (const record of records) {
  const [existing] = await database.select({ id: talent.id }).from(talent)
    .where(eq(talent.airtableRecordId, record.airtableRecordId)).limit(1);
  const values = {
    airtableRecordId: record.airtableRecordId,
    stageName: record.stageName,
    fullName: record.fullName,
    email: record.email,
    phone: record.phone,
    instagramHandle: record.instagramHandle,
    rosterStatus: record.rosterStatus,
    talentStatus: record.talentStatus,
    homeMarket: record.homeMarket,
    genres: record.genres,
    priority: record.priority,
    talentNotes: record.talentNotes,
    legacyOutstandingOwedCents: record.legacyOutstandingOwedCents,
    legacyTotalEarningsCents: record.legacyTotalEarningsCents,
    legacyOwedFrom: record.legacyOwedFrom,
    legacyUpcomingBookings: record.legacyUpcomingBookings,
    airtableImportedAt: importedAt,
    updatedAt: importedAt,
  };
  const [artist] = existing
    ? await database.update(talent).set(values).where(eq(talent.id, existing.id)).returning({ id: talent.id })
    : await database.insert(talent).values(values).returning({ id: talent.id });
  if (existing) updated += 1;
  else created += 1;

  await database.insert(talentPaymentProfiles).values({
    talentId: artist.id,
    paymentMethod: record.payment.paymentMethod,
    zelleEmail: record.payment.zelleEmail,
    zellePhone: record.payment.zellePhone,
    achAccountNameEncrypted: encryptSensitiveField(record.payment.achAccountName),
    achRoutingNumberEncrypted: encryptSensitiveField(record.payment.achRoutingNumber),
    achAccountNumberEncrypted: encryptSensitiveField(record.payment.achAccountNumber),
    lastFour: record.payment.lastFour,
    updatedAt: importedAt,
  }).onConflictDoUpdate({
    target: talentPaymentProfiles.talentId,
    set: {
      paymentMethod: record.payment.paymentMethod,
      zelleEmail: record.payment.zelleEmail,
      zellePhone: record.payment.zellePhone,
      achAccountNameEncrypted: encryptSensitiveField(record.payment.achAccountName),
      achRoutingNumberEncrypted: encryptSensitiveField(record.payment.achRoutingNumber),
      achAccountNumberEncrypted: encryptSensitiveField(record.payment.achAccountNumber),
      lastFour: record.payment.lastFour,
      updatedAt: importedAt,
    },
  });

  if (supabase) {
    for (const attachment of record.w9Attachments) {
      if (!W9_CONTENT_TYPES.has(attachment.type)) throw new Error(`Unsupported W-9 type for ${record.airtableRecordId}.`);
      if (attachment.size !== null && attachment.size > MAX_W9_BYTES) throw new Error(`W-9 is too large for ${record.airtableRecordId}.`);
      const storagePath = `airtable-import/${record.airtableRecordId}/${attachment.id}${attachmentExtension(attachment.filename, attachment.type)}`;
      const [document] = await database.select({ id: talentDocuments.id }).from(talentDocuments)
        .where(eq(talentDocuments.storagePath, storagePath)).limit(1);
      if (document) continue;
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
        await database.insert(talentDocuments).values({
          talentId: artist.id,
          kind: "W-9",
          storagePath,
          contentType: attachment.type,
          uploadedByUserId: actor.id,
        });
        documentsImported += 1;
      } catch (error) {
        await supabase.storage.from("talent-documents").remove([storagePath]);
        throw error;
      }
    }
  }

  await database.insert(auditLog).values({
    actorUserId: actor.id,
    actorLabel: actorEmail,
    action: existing ? "talent_airtable_reimported" : "talent_airtable_imported",
    entityType: "talent",
    entityId: artist.id,
    details: {
      airtableRecordId: record.airtableRecordId,
      talentStatus: record.talentStatus,
      rosterStatus: record.rosterStatus,
      w9AttachmentCount: record.w9Attachments.length,
    },
  });
}

process.stdout.write(
  `Airtable Talent import complete: ${created} created, ${updated} updated, ${documentsImported} W-9 documents stored.\n`,
);
