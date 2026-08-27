import { describe, expect, it } from "vitest";
import {
  archivePathFor,
  parseStorageBackupManifest,
  resolveInside,
  sha256,
  STORAGE_BACKUP_VERSION,
} from "./storage-backup";

describe("storage backup helpers", () => {
  it("uses stable, filesystem-safe object paths", () => {
    const first = archivePathFor("invoice-pdfs", "residency/invoice/v1.pdf");
    const second = archivePathFor("invoice-pdfs", "residency/invoice/v1.pdf");
    expect(first).toBe(second);
    expect(first).toMatch(/^objects\/[0-9a-f]{2}\/[0-9a-f]{64}$/);
  });

  it("calculates SHA-256", () => {
    expect(sha256(Buffer.from("HFY"))).toBe("a1b8831505964e3adef5352b397bd06e32e7f3d81f2d20a0e1051bdb6726db3b");
  });

  it("rejects paths outside the export root", () => {
    expect(() => resolveInside("/tmp/hfy", "../escape")).toThrow("Unsafe archive path");
  });

  it("validates manifest counts and deterministic archive paths", () => {
    const storagePath = "one.pdf";
    const manifest = {
      version: STORAGE_BACKUP_VERSION,
      createdAt: "2026-08-26T00:00:00.000Z",
      sourceProjectUrl: "https://example.supabase.co",
      buckets: [],
      objects: [
        {
          bucketId: "invoice-pdfs",
          storagePath,
          archivePath: archivePathFor("invoice-pdfs", storagePath),
          byteSize: 3,
          sha256: sha256(Buffer.from("HFY")),
          contentType: "application/pdf",
          createdAt: null,
          updatedAt: null,
          lastAccessedAt: null,
        },
      ],
      totals: { objectCount: 1, byteSize: 3 },
    };
    expect(parseStorageBackupManifest(manifest)).toEqual(manifest);
  });
});
