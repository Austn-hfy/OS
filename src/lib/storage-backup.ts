import { createHash } from "node:crypto";
import { resolve, sep } from "node:path";

export const STORAGE_BACKUP_VERSION = 1 as const;

export type StorageBackupBucket = {
  id: string;
  name: string;
  public: boolean;
  fileSizeLimit: number | null;
  allowedMimeTypes: string[] | null;
};

export type StorageBackupObject = {
  bucketId: string;
  storagePath: string;
  archivePath: string;
  byteSize: number;
  sha256: string;
  contentType: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastAccessedAt: string | null;
};

export type StorageBackupManifest = {
  version: typeof STORAGE_BACKUP_VERSION;
  createdAt: string;
  sourceProjectUrl: string;
  buckets: StorageBackupBucket[];
  objects: StorageBackupObject[];
  totals: {
    objectCount: number;
    byteSize: number;
  };
};

export function sha256(input: Uint8Array) {
  return createHash("sha256").update(input).digest("hex");
}

export function archivePathFor(bucketId: string, storagePath: string) {
  const digest = createHash("sha256").update(`${bucketId}\0${storagePath}`).digest("hex");
  return `objects/${digest.slice(0, 2)}/${digest}`;
}

export function resolveInside(root: string, relativePath: string) {
  const absoluteRoot = resolve(root);
  const absolutePath = resolve(absoluteRoot, relativePath);
  if (absolutePath !== absoluteRoot && !absolutePath.startsWith(`${absoluteRoot}${sep}`)) {
    throw new Error(`Unsafe archive path: ${relativePath}`);
  }
  return absolutePath;
}

export function parseStorageBackupManifest(value: unknown): StorageBackupManifest {
  if (!value || typeof value !== "object") throw new Error("Storage backup manifest must be an object.");
  const manifest = value as Partial<StorageBackupManifest>;
  if (manifest.version !== STORAGE_BACKUP_VERSION) {
    throw new Error(`Unsupported storage backup manifest version: ${String(manifest.version)}`);
  }
  if (typeof manifest.createdAt !== "string" || typeof manifest.sourceProjectUrl !== "string") {
    throw new Error("Storage backup manifest is missing its source metadata.");
  }
  if (!Array.isArray(manifest.buckets) || !Array.isArray(manifest.objects)) {
    throw new Error("Storage backup manifest is missing buckets or objects.");
  }
  if (!manifest.totals || typeof manifest.totals.objectCount !== "number" || typeof manifest.totals.byteSize !== "number") {
    throw new Error("Storage backup manifest is missing totals.");
  }

  for (const object of manifest.objects) {
    if (
      !object ||
      typeof object.bucketId !== "string" ||
      typeof object.storagePath !== "string" ||
      typeof object.archivePath !== "string" ||
      typeof object.byteSize !== "number" ||
      typeof object.sha256 !== "string"
    ) {
      throw new Error("Storage backup manifest contains an invalid object entry.");
    }
    if (object.archivePath !== archivePathFor(object.bucketId, object.storagePath)) {
      throw new Error(`Storage backup archive path mismatch for ${object.bucketId}/${object.storagePath}.`);
    }
  }

  if (manifest.totals.objectCount !== manifest.objects.length) {
    throw new Error("Storage backup object count does not match the manifest.");
  }

  return manifest as StorageBackupManifest;
}
