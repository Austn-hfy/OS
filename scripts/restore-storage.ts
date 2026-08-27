import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parseStorageBackupManifest, resolveInside, sha256 } from "../src/lib/storage-backup";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

const inputArgument = argument("--input");
if (!inputArgument) throw new Error("Pass an extracted export directory with --input.");
const inputRoot = resolve(inputArgument);
const apply = process.argv.includes("--apply");
const overwrite = process.argv.includes("--overwrite");
const manifest = parseStorageBackupManifest(JSON.parse(await readFile(resolveInside(inputRoot, "manifest.json"), "utf8")));

if (!apply) {
  process.stdout.write(
    `Restore dry run: ${manifest.objects.length} objects from ${manifest.buckets.length} buckets. Re-run with --apply to upload.\n`,
  );
  process.exit(0);
}

const supabase = createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const existingBuckets = await supabase.storage.listBuckets();
if (existingBuckets.error) throw new Error(`Could not list target buckets: ${existingBuckets.error.message}`);
const existingIds = new Set(existingBuckets.data.map((bucket) => bucket.id));

for (const bucket of manifest.buckets) {
  if (!existingIds.has(bucket.id)) {
    const created = await supabase.storage.createBucket(bucket.id, {
      public: bucket.public,
      fileSizeLimit: bucket.fileSizeLimit ?? undefined,
      allowedMimeTypes: bucket.allowedMimeTypes ?? undefined,
    });
    if (created.error) throw new Error(`Could not create target bucket ${bucket.id}: ${created.error.message}`);
  }
}

for (const object of manifest.objects) {
  const bytes = await readFile(resolveInside(inputRoot, object.archivePath));
  if (bytes.length !== object.byteSize || sha256(bytes) !== object.sha256) {
    throw new Error(`Backup verification failed before restoring ${object.bucketId}/${object.storagePath}.`);
  }
  const upload = await supabase.storage.from(object.bucketId).upload(object.storagePath, bytes, {
    contentType: object.contentType ?? undefined,
    upsert: overwrite,
  });
  if (upload.error) throw new Error(`Could not restore ${object.bucketId}/${object.storagePath}: ${upload.error.message}`);
}

process.stdout.write(`Storage restore complete: ${manifest.objects.length} objects.\n`);
