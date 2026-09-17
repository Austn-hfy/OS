import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  parseProductionStructureSnapshot,
  type ProductionStructureSnapshot,
} from "@/domain/staging-structure-sync";

export async function loadProductionStructureExport(residencySlug: string): Promise<ProductionStructureSnapshot> {
  const result = await getDb().execute<{ snapshot: Record<string, unknown> }>(sql`
    select private.hfy_staging_structure_snapshot(${residencySlug}) as snapshot
  `);
  const snapshot = result.rows[0]?.snapshot;
  if (!snapshot) throw new Error("Production structure export returned no result.");
  return parseProductionStructureSnapshot(snapshot, [residencySlug]);
}

export async function productionDatabasePrincipal(): Promise<string> {
  const result = await getDb().execute<{ current_user: string }>(sql`select current_user`);
  return result.rows[0]?.current_user ?? "unknown";
}
