import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  archivePathFor,
  resolveInside,
  sha256,
  STORAGE_BACKUP_VERSION,
  type StorageBackupManifest,
} from "../src/lib/storage-backup";

const DEFAULT_BUCKETS = ["invoice-pdfs", "brand-assets", "talent-documents"];
const PAGE_SIZE = 1_000;
type ListedFile = NonNullable<
  Awaited<ReturnType<ReturnType<SupabaseClient["storage"]["from"]>["list"]>>["data"]
>[number];

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function selectedBuckets() {
  const configured = process.env.STORAGE_BACKUP_BUCKETS?.split(",").map((value) => value.trim()).filter(Boolean);
  return configured?.length ? configured : DEFAULT_BUCKETS;
}

async function listObjects(supabase: SupabaseClient, bucketId: string, prefix = ""): Promise<Array<{ path: string; file: ListedFile }>> {
  const objects: Array<{ path: string; file: ListedFile }> = [];
  let offset = 0;

  while (true) {
    const result = await supabase.storage.from(bucketId).list(prefix, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (result.error) throw new Error(`Could not list ${bucketId}/${prefix}: ${result.error.message}`);

    for (const file of result.data) {
      const path = prefix ? `${prefix}/${file.name}` : file.name;
      if (file.id === null) objects.push(...(await listObjects(supabase, bucketId, path)));
      else objects.push({ path, file });
    }

    if (result.data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return objects;
}

const outputRoot = resolve(argument("--output") ?? `.storage-backup/${new Date().toISOString().replaceAll(":", "-")}`);
const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const allBuckets = await supabase.storage.listBuckets();
if (allBuckets.error) throw new Error(`Could not list Storage buckets: ${allBuckets.error.message}`);

const bucketIds = selectedBuckets();
const bucketById = new Map(allBuckets.data.map((bucket) => [bucket.id, bucket]));
for (const bucketId of bucketIds) {
  if (!bucketById.has(bucketId)) throw new Error(`Expected Storage bucket does not exist: ${bucketId}`);
}

const manifest: StorageBackupManifest = {
  version: STORAGE_BACKUP_VERSION,
  createdAt: new Date().toISOString(),
  sourceProjectUrl: supabaseUrl,
  buckets: bucketIds.map((bucketId) => {
    const bucket = bucketById.get(bucketId)!;
    return {
      id: bucket.id,
      name: bucket.name,
      public: bucket.public,
      fileSizeLimit: typeof bucket.file_size_limit === "number" ? bucket.file_size_limit : null,
      allowedMimeTypes: Array.isArray(bucket.allowed_mime_types) ? bucket.allowed_mime_types : null,
    };
  }),
  objects: [],
  totals: { objectCount: 0, byteSize: 0 },
};

for (const bucketId of bucketIds) {
  const objects = await listObjects(supabase, bucketId);
  for (const { path: storagePath, file } of objects) {
    const download = await supabase.storage.from(bucketId).download(storagePath);
    if (download.error) throw new Error(`Could not download ${bucketId}/${storagePath}: ${download.error.message}`);
    const bytes = Buffer.from(await download.data.arrayBuffer());
    const archivePath = archivePathFor(bucketId, storagePath);
    const destination = resolveInside(outputRoot, archivePath);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);

    const expectedSize = typeof file.metadata?.size === "number" ? file.metadata.size : null;
    if (expectedSize !== null && expectedSize !== bytes.length) {
      throw new Error(`Downloaded byte size mismatch for ${bucketId}/${storagePath}.`);
    }

    manifest.objects.push({
      bucketId,
      storagePath,
      archivePath,
      byteSize: bytes.length,
      sha256: sha256(bytes),
      contentType: typeof file.metadata?.mimetype === "string" ? file.metadata.mimetype : download.data.type || null,
      createdAt: file.created_at ?? null,
      updatedAt: file.updated_at ?? null,
      lastAccessedAt: file.last_accessed_at ?? null,
    });
    manifest.totals.objectCount += 1;
    manifest.totals.byteSize += bytes.length;
  }
}

await writeFile(resolveInside(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(
  `Storage export complete: ${manifest.totals.objectCount} objects, ${manifest.totals.byteSize} bytes across ${manifest.buckets.length} buckets.\n`,
);
