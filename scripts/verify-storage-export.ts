import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseStorageBackupManifest, resolveInside, sha256 } from "../src/lib/storage-backup";

const index = process.argv.indexOf("--input");
const inputRoot = resolve(index === -1 ? ".storage-backup/latest" : process.argv[index + 1] ?? "");
const manifest = parseStorageBackupManifest(JSON.parse(await readFile(resolveInside(inputRoot, "manifest.json"), "utf8")));

let totalBytes = 0;
for (const object of manifest.objects) {
  const bytes = await readFile(resolveInside(inputRoot, object.archivePath));
  if (bytes.length !== object.byteSize) throw new Error(`Byte size mismatch for ${object.bucketId}/${object.storagePath}.`);
  if (sha256(bytes) !== object.sha256) throw new Error(`SHA-256 mismatch for ${object.bucketId}/${object.storagePath}.`);
  totalBytes += bytes.length;
}

if (totalBytes !== manifest.totals.byteSize) throw new Error("Export byte total does not match the manifest.");
process.stdout.write(`Storage export verified: ${manifest.objects.length} objects, ${totalBytes} bytes.\n`);
