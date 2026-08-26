import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const buckets = [
  { id: "invoice-pdfs", fileSizeLimit: 8 * 1024 * 1024, allowedMimeTypes: ["application/pdf"] },
  { id: "brand-assets", fileSizeLimit: 2 * 1024 * 1024, allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] },
  { id: "talent-documents", fileSizeLimit: 8 * 1024 * 1024, allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png"] },
];

for (const bucket of buckets) {
  const result = await supabase.storage.createBucket(bucket.id, {
    public: false,
    fileSizeLimit: bucket.fileSizeLimit,
    allowedMimeTypes: bucket.allowedMimeTypes,
  });
  if (result.error && !result.error.message.toLowerCase().includes("already exists")) throw result.error;
  process.stdout.write(`${bucket.id}: private bucket ready\n`);
}
