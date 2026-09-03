import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLog, residencies } from "@/db/schema";

export async function getLastStagingStructureSync() {
  const [row] = await getDb().select({
    actorLabel: auditLog.actorLabel,
    completedAt: auditLog.createdAt,
    details: auditLog.details,
    residencyName: residencies.name,
  }).from(auditLog)
    .innerJoin(residencies, eq(auditLog.residencyId, residencies.id))
    .where(eq(auditLog.action, "staging_structure_synced_from_production"))
    .orderBy(desc(auditLog.createdAt))
    .limit(1);
  if (!row) return null;
  return {
    actorLabel: row.actorLabel,
    completedAt: row.completedAt.toISOString(),
    residencyName: row.residencyName,
    daypartCount: Number(row.details.daypartCount ?? 0),
    artistCount: Number(row.details.artistCount ?? 0),
  };
}
