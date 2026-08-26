import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is not configured.");
  return value;
}

type Database = ReturnType<typeof drizzle<typeof schema>>;

const globalForDatabase = globalThis as unknown as {
  hfySql?: ReturnType<typeof postgres>;
  hfyDb?: Database;
};

export function getDb(): Database {
  if (globalForDatabase.hfyDb) return globalForDatabase.hfyDb;

  const sqlClient = globalForDatabase.hfySql ?? postgres(databaseUrl(), {
    prepare: false,
    max: process.env.NODE_ENV === "production" ? 10 : 2,
  });
  const database = drizzle(sqlClient, { schema });

  if (process.env.NODE_ENV !== "production") {
    globalForDatabase.hfySql = sqlClient;
    globalForDatabase.hfyDb = database;
  }
  return database;
}
