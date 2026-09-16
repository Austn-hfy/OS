import { readFile } from "node:fs/promises";
import path from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type ReservedSql } from "postgres";
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
  console.log(`Migration history read succeeded; latest applied timestamp is ${lastApplied}.`);

  for (const entry of pending) {
    const filename = `${entry.tag}.sql`;
    const source = await readFile(path.join(migrationsFolder, filename), "utf8");
    const result = assertMigrationIsSafe(filename, source);
    if (result.findings.length) {
      console.log(`Migration ${filename} contains explicitly permitted destructive operations: ${result.findings.map((finding) => finding.operation).join(", ")}.`);
    }
  }

  console.log(`Migration safety scan completed: ${pending.length} pending migration${pending.length === 1 ? "" : "s"}.`);
  return { lastApplied, pending };
}

async function applyMigrations(candidate: MigrationConnectionCandidate) {
  const client = postgres(candidate.databaseUrl, {
    connect_timeout: 15,
    idle_timeout: 10,
    max: 2,
    prepare: false,
  });
  const database = drizzle(client);

  try {
    await client`select 1`;
    console.log("Acquiring the deployment migration advisory lock.");
    await runWithMigrationAdvisoryLock(
      client as unknown as AdvisoryLockClient<ReservedSql>,
      async (transaction) => {
        console.log("Deployment migration advisory lock acquired.");
        const { pending } = await validatePendingMigrations(transaction);
        await migrate(database, { migrationsFolder });
        const lastApplied = await lastAppliedMigrationTimestamp(transaction);
        const expectedLastApplied = pending.at(-1)?.when;
        if (expectedLastApplied && lastApplied < expectedLastApplied) {
          throw new Error(
            `Migration history verification failed: expected timestamp ${expectedLastApplied}, found ${lastApplied}.`,
          );
        }
        console.log(`Migration history write verification succeeded; latest applied timestamp is ${lastApplied}.`);
      },
    );
    console.log("Deployment migration advisory lock released.");
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function migrateDeployment(plan: Extract<DeploymentMigrationPlan, { action: "run" }>) {
  const candidates = migrationConnectionCandidates(plan.databaseUrl, plan.sessionDatabaseUrl);
  console.log(`Validated ${plan.target} migration target: Supabase project ${plan.expectedProjectRef}.`);

  await migrateWithCandidates(candidates, plan.target);
}

async function migrateWithCandidates(candidates: MigrationConnectionCandidate[], target: string) {
  for (const [index, candidate] of candidates.entries()) {
    try {
      console.log(`Connecting through the ${candidate.mode} migration endpoint.`);
      await applyMigrations(candidate);
      console.log(`Database migrations completed successfully for ${target}.`);
      return;
    } catch (error) {
      const canFallback = index === 0
        && candidate.mode === "direct"
        && candidates[index + 1]?.mode === "session-pooler"
        && isConnectionAvailabilityError(error);
      if (canFallback) {
        console.warn(
          "The direct migration endpoint is unavailable; retrying with the validated same-role MIGRATION_DATABASE_SESSION_URL.",
        );
        continue;
      }
      if (index === 0 && candidate.mode === "direct" && isConnectionAvailabilityError(error)) {
        throw new Error(
          `The direct migration endpoint is unavailable for ${target}, and no valid MIGRATION_DATABASE_SESSION_URL fallback is configured. Migration stopped without using DATABASE_URL.`,
          { cause: error },
        );
      }
      if (candidate.mode === "session-pooler") {
        throw new Error(
          `MIGRATION_DATABASE_SESSION_URL failed for ${target}. Migration stopped without using DATABASE_URL.`,
          { cause: error },
        );
      }
      throw error;
    }
  }

  throw new Error(`No usable database migration connection was available for ${target}.`);
}

async function migrateLocally() {
  const databaseUrl = process.env.MIGRATION_DATABASE_URL;
  if (!databaseUrl) throw new Error("MIGRATION_DATABASE_URL is required to run database migrations locally.");
  const candidates = migrationConnectionCandidates(
    databaseUrl,
    process.env.MIGRATION_DATABASE_SESSION_URL ?? null,
  );
  await migrateWithCandidates(candidates, "the local target");
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
