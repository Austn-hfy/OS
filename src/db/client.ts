import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is not configured.");
  return value;
}

export const databasePoolConfig = {
  max: 5,
  min: 0,
  idleTimeoutMillis: 5_000,
  connectionTimeoutMillis: 10_000,
  maxLifetimeSeconds: 30 * 60,
  allowExitOnIdle: true,
} as const satisfies PoolConfig;

export type DatabaseConnectionInfo = {
  hostType: "supavisor-shared" | "supabase-database" | "other";
  port: string;
  transactionMode: boolean;
  databaseRegion: string | null;
  preparedStatements: false;
};

export function classifyDatabaseConnection(value: string): DatabaseConnectionInfo {
  const url = new URL(value);
  const sharedSupavisor = url.hostname.endsWith(".pooler.supabase.com");
  const supabaseDatabase = url.hostname.startsWith("db.") && url.hostname.endsWith(".supabase.co");
  const regionMatch = url.hostname.match(/^aws-\d+-(.+)\.pooler\.supabase\.com$/);

  return {
    hostType: sharedSupavisor ? "supavisor-shared" : supabaseDatabase ? "supabase-database" : "other",
    port: url.port || "5432",
    transactionMode: url.port === "6543",
    databaseRegion: regionMatch?.[1] ?? null,
    // node-postgres only prepares named queries; Drizzle's normal query path does not provide a name.
    preparedStatements: false,
  };
}

type Database = ReturnType<typeof drizzle<typeof schema>>;

const globalForDatabase = globalThis as unknown as {
  hfyPgPool?: Pool;
  hfyDb?: Database;
  hfyDatabasePoolAttached?: boolean;
};

function createDatabasePool(): Pool {
  const pool = new Pool({
    connectionString: databaseUrl(),
    ...databasePoolConfig,
    application_name: "hfy-os",
  });

  pool.on("error", (error) => {
    console.error("Unexpected error from an idle database connection.", error);
  });

  attachDatabasePool(pool);
  globalForDatabase.hfyDatabasePoolAttached = true;
  return pool;
}

function getDatabasePool(): Pool {
  globalForDatabase.hfyPgPool ??= createDatabasePool();
  return globalForDatabase.hfyPgPool;
}

export function getDb(): Database {
  globalForDatabase.hfyDb ??= drizzle(getDatabasePool(), { schema });
  return globalForDatabase.hfyDb;
}

export function getDatabaseRuntimeDiagnostics() {
  const pool = getDatabasePool();

  return {
    connection: classifyDatabaseConnection(databaseUrl()),
    lifecycle: {
      globalPool: true,
      vercelPoolAttached: globalForDatabase.hfyDatabasePoolAttached === true,
      idleTimeoutMillis: databasePoolConfig.idleTimeoutMillis,
      connectionTimeoutMillis: databasePoolConfig.connectionTimeoutMillis,
      maxLifetimeSeconds: databasePoolConfig.maxLifetimeSeconds,
    },
    pool: {
      max: databasePoolConfig.max,
      min: databasePoolConfig.min,
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    },
  };
}
