import { readFile } from "node:fs/promises";
import path from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type ReservedSql, type Sql } from "postgres";
import {
  assertMigrationIsSafe,
  executeDeploymentMigration,
  isConnectionAvailabilityError,
  migrationConnectionCandidates,
  runWithMigrationAdvisoryLock,
  type AdvisoryLockClient,
  type DeploymentMigrationPlan,
  type MigrationConnectionCandidate,
} from "../src/domain/deployment-migrations";

const migrationsFolder = path.resolve("drizzle");
const migrationJournalPath = path.join(migrationsFolder, "meta", "_journal.json");

type MigrationJournal = {
  entries: Array<{
    tag: string;
    when: number;
  }>;
};

type SerializedError = {
  value?: string;
  name?: string;
  message?: string;
  code?: string;
  severity?: string;
  detail?: string;
  hint?: string;
  schema?: string;
  table?: string;
  constraint?: string;
  cause?: SerializedError;
};

function describeError(error: unknown): SerializedError {
  if (!(error instanceof Error)) return { value: String(error) };

  const details = error as Error & {
    code?: string;
    severity?: string;
    detail?: string;
    hint?: string;
    schema_name?: string;
    table_name?: string;
    constraint_name?: string;
    cause?: unknown;
  };

  return {
    name: details.name,
    message: details.message,
    code: details.code,
    severity: details.severity,
    detail: details.detail,
    hint: details.hint,
    schema: details.schema_name,
    table: details.table_name,
    constraint: details.constraint_name,
    cause: details.cause ? describeError(details.cause) : undefined,
  };
}

async function readMigrationJournal(): Promise<MigrationJournal> {
  const parsed = JSON.parse(await readFile(migrationJournalPath, "utf8")) as Partial<MigrationJournal>;
  if (!Array.isArray(parsed.entries)) throw new Error("Drizzle migration journal is missing its entries array.");
  return { entries: parsed.entries };
}

async function lastAppliedMigrationTimestamp(transaction: ReservedSql) {
  const relation = await transaction.unsafe<Array<{ migration_table: string | null }>>(
    "select to_regclass('drizzle.__drizzle_migrations')::text as migration_table",
  );
  if (!relation[0]?.migration_table) return 0;

  const result = await transaction.unsafe<Array<{ last_migration: string | null }>>(
    "select max(created_at)::text as last_migration from drizzle.__drizzle_migrations",
  );
  return Number(result[0]?.last_migration ?? 0);
}

async function validatePendingMigrations(transaction: ReservedSql) {
  const [journal, lastApplied] = await Promise.all([
    readMigrationJournal(),
    lastAppliedMigrationTimestamp(transaction),
  ]);
  const pending = journal.entries.filter((entry) => entry.when > lastApplied);

  for (const entry of pending) {
    const filename = `${entry.tag}.sql`;
    const source = await readFile(path.join(migrationsFolder, filename), "utf8");
    const result = assertMigrationIsSafe(filename, source);
    if (result.findings.length) {
      console.log(`Migration ${filename} contains explicitly permitted destructive operations: ${result.findings.map((finding) => finding.operation).join(", ")}.`);
    }
  }

  console.log(`Migration safety scan completed: ${pending.length} pending migration${pending.length === 1 ? "" : "s"}.`);
}

async function applyMigrations(candidate: MigrationConnectionCandidate) {
  const client = postgres(candidate.databaseUrl, {
    connect_timeout: 15,
    idle_timeout: 10,
    max: 1,
    prepare: false,
  });

  try {
    await client`select 1`;
    await runWithMigrationAdvisoryLock(
      client as unknown as AdvisoryLockClient<ReservedSql>,
      async (transaction) => {
        await validatePendingMigrations(transaction);
        const database = drizzle(transaction as unknown as Sql);
        await migrate(database, { migrationsFolder });
      },
    );
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function migrateDeployment(plan: Extract<DeploymentMigrationPlan, { action: "run" }>) {
  const candidates = migrationConnectionCandidates(plan.databaseUrl, plan.fallbackDatabaseUrl);
  console.log(`Validated ${plan.target} migration target: Supabase project ${plan.expectedProjectRef}.`);

  for (const [index, candidate] of candidates.entries()) {
    try {
      console.log(`Connecting through the ${candidate.mode} migration endpoint.`);
      await applyMigrations(candidate);
      console.log(`Database migrations completed successfully for ${plan.target}.`);
      return;
    } catch (error) {
      const canFallback = index === 0
        && candidate.mode === "direct"
        && candidates[index + 1]?.mode === "session-pooler"
        && isConnectionAvailabilityError(error);
      if (!canFallback) throw error;
      console.warn("The direct migration endpoint is unavailable; retrying through the validated session-mode pooler.");
    }
  }

  throw new Error(`No usable database migration connection was available for ${plan.target}.`);
}

async function migrateLocally() {
  const databaseUrl = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("MIGRATION_DATABASE_URL or DATABASE_URL is required to run database migrations locally.");
  const candidates = migrationConnectionCandidates(databaseUrl, process.env.DATABASE_URL ?? null);
  await applyMigrations(candidates[0]!);
  console.log("Database migrations completed successfully for the local target.");
}

try {
  if (process.argv.includes("--deployment")) {
    const result = await executeDeploymentMigration(process.env, migrateDeployment);
    if (result.action === "skip") console.log(`Skipping database migrations: ${result.reason}`);
  } else {
    await migrateLocally();
  }
} catch (error) {
  console.error("Database migration failed:", JSON.stringify(describeError(error)));
  throw error;
}
