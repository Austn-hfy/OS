import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run database migrations.");
}

const client = postgres(databaseUrl, { max: 1 });
const database = drizzle(client);

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
  if (!(error instanceof Error)) {
    return { value: String(error) };
  }

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

try {
  await migrate(database, { migrationsFolder: "./drizzle" });
  console.log("Database migrations completed successfully.");
} catch (error) {
  console.error("Database migration failed:", JSON.stringify(describeError(error)));
  throw error;
} finally {
  await client.end();
}
