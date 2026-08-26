import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLog, platformSettings } from "@/db/schema";
import type { InternalActor } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const PLATFORM_SETTINGS_ID = "00000000-0000-4000-8000-0000000000f1";
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export type InvoiceLogoReference = {
  storagePath: string;
  contentType: "image/png" | "image/jpeg" | "image/webp";
  sha256: string;
  byteSize: number;
};

export type InvoiceBrandingSettings = {
  companyName: string;
  billingEmail: string;
  billingAddress: string;
  logo: InvoiceLogoReference | null;
};

function detectImageType(bytes: Uint8Array): InvoiceLogoReference["contentType"] | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF"
    && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

function logoFromRow(row: typeof platformSettings.$inferSelect | undefined): InvoiceLogoReference | null {
  if (!row?.invoiceLogoStoragePath || !row.invoiceLogoContentType || !row.invoiceLogoSha256 || !row.invoiceLogoByteSize) return null;
  if (!(["image/png", "image/jpeg", "image/webp"] as string[]).includes(row.invoiceLogoContentType)) return null;
  return {
    storagePath: row.invoiceLogoStoragePath,
    contentType: row.invoiceLogoContentType as InvoiceLogoReference["contentType"],
    sha256: row.invoiceLogoSha256,
    byteSize: row.invoiceLogoByteSize,
  };
}

export async function getInvoiceBrandingSettings(): Promise<InvoiceBrandingSettings> {
  const [row] = await getDb().select().from(platformSettings).where(eq(platformSettings.id, PLATFORM_SETTINGS_ID)).limit(1);
  return {
    companyName: row?.companyName || process.env.INVOICE_BUSINESS_NAME || "Hear For You",
    billingEmail: row?.billingEmail || process.env.INVOICE_BUSINESS_EMAIL || "billing@hearforyou.group",
    billingAddress: row?.billingAddress || process.env.INVOICE_BUSINESS_ADDRESS || "",
    logo: logoFromRow(row),
  };
}

export async function loadInvoiceLogoDataUrl(logo: InvoiceLogoReference | null) {
  if (!logo) return null;
  const download = await createSupabaseAdminClient().storage.from("brand-assets").download(logo.storagePath);
  if (download.error) throw new Error("The saved Invoice logo could not be loaded.");
  const bytes = Buffer.from(await download.data.arrayBuffer());
  if (bytes.length !== logo.byteSize || createHash("sha256").update(bytes).digest("hex") !== logo.sha256) {
    throw new Error("The saved Invoice logo no longer matches its approved branding record.");
  }
  if (detectImageType(bytes) !== logo.contentType) throw new Error("The saved Invoice logo has an invalid file type.");
  return `data:${logo.contentType};base64,${bytes.toString("base64")}`;
}

export async function saveInvoiceBranding(
  actor: InternalActor,
  input: { companyName: string; billingEmail: string; billingAddress: string; logoFile?: File | null },
) {
  let uploadedPath: string | null = null;
  try {
    const existing = await getInvoiceBrandingSettings();
    let logo = existing.logo;
    if (input.logoFile && input.logoFile.size > 0) {
      if (input.logoFile.size > MAX_LOGO_BYTES) throw new Error("Invoice logo must be 2 MB or smaller.");
      const bytes = Buffer.from(await input.logoFile.arrayBuffer());
      const contentType = detectImageType(bytes);
      if (!contentType) throw new Error("Invoice logo must be a PNG, JPEG, or WebP image.");
      const extension = contentType === "image/png" ? "png" : contentType === "image/jpeg" ? "jpg" : "webp";
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const storagePath = `invoice-branding/${randomUUID()}.${extension}`;
      const upload = await createSupabaseAdminClient().storage.from("brand-assets").upload(storagePath, bytes, {
        contentType,
        cacheControl: "31536000",
        upsert: false,
      });
      if (upload.error) throw upload.error;
      uploadedPath = storagePath;
      logo = { storagePath, contentType, sha256, byteSize: bytes.length };
    }

    const database = getDb();
    await database.transaction(async (tx) => {
      await tx.insert(platformSettings).values({
        id: PLATFORM_SETTINGS_ID,
        companyName: input.companyName,
        billingEmail: input.billingEmail,
        billingAddress: input.billingAddress,
        invoiceLogoStoragePath: logo?.storagePath ?? null,
        invoiceLogoContentType: logo?.contentType ?? null,
        invoiceLogoSha256: logo?.sha256 ?? null,
        invoiceLogoByteSize: logo?.byteSize ?? null,
        updatedByUserId: actor.userId,
      }).onConflictDoUpdate({
        target: platformSettings.id,
        set: {
          companyName: input.companyName,
          billingEmail: input.billingEmail,
          billingAddress: input.billingAddress,
          invoiceLogoStoragePath: logo?.storagePath ?? null,
          invoiceLogoContentType: logo?.contentType ?? null,
          invoiceLogoSha256: logo?.sha256 ?? null,
          invoiceLogoByteSize: logo?.byteSize ?? null,
          updatedByUserId: actor.userId,
          updatedAt: new Date(),
        },
      });
      await tx.insert(auditLog).values({
        actorUserId: actor.userId,
        actorLabel: actor.email,
        action: "invoice_branding_updated",
        entityType: "platform_settings",
        entityId: PLATFORM_SETTINGS_ID,
        details: { companyName: input.companyName, billingEmail: input.billingEmail, logoUpdated: Boolean(uploadedPath) },
      });
    });
    uploadedPath = null;
  } catch (error) {
    if (uploadedPath) await createSupabaseAdminClient().storage.from("brand-assets").remove([uploadedPath]);
    throw error;
  }
}
