import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run database migrations.");
}

const client = postgres(databaseUrl, { max: 1 });
const database = drizzle(client);

try {
  await migrate(database, { migrationsFolder: "./drizzle" });
  console.log("Database migrations completed successfully.");
} catch (error) {
  console.error("Database migration failed.", error);
  throw error;
} finally {
  await client.end();
}
