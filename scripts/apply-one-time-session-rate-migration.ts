import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to apply the one-time session rate migration.");
}

const sql = postgres(databaseUrl, { max: 1, prepare: false });

try {
  await sql.begin(async (transaction) => {
    await transaction.unsafe(`
      SELECT pg_advisory_xact_lock(hashtext('hfy_os_one_time_session_rate')::bigint)
    `);
    await transaction.unsafe(`
      ALTER TABLE "shifts"
      ADD COLUMN IF NOT EXISTS "client_talent_default_rate_cents" integer
    `);
    await transaction.unsafe(`
      UPDATE "shifts" AS s
      SET "client_talent_default_rate_cents" = existing."default_rate_cents"
      FROM (
        SELECT a."shift_id", max(cat."default_rate_cents") AS "default_rate_cents"
        FROM "assignments" AS a
        INNER JOIN "client_assignment_terms" AS cat ON cat."assignment_id" = a."id"
        WHERE cat."default_rate_cents" IS NOT NULL
        GROUP BY a."shift_id"
      ) AS existing
      WHERE s."id" = existing."shift_id"
        AND s."client_talent_default_rate_cents" IS NULL
        AND s."daypart_id" IS NULL
        AND s."economics_mode" = 'client_owned'
    `);
    const existingConstraint = await transaction<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'shifts_client_talent_default_rate_nonnegative'
          AND conrelid = 'shifts'::regclass
      ) AS "exists"
    `;
    if (!existingConstraint[0]?.exists) {
      await transaction.unsafe(`
        ALTER TABLE "shifts"
        ADD CONSTRAINT "shifts_client_talent_default_rate_nonnegative"
        CHECK ("client_talent_default_rate_cents" IS NULL OR "client_talent_default_rate_cents" >= 0)
      `);
    }
  });
  console.log("One-time session rate migration completed successfully.");
} catch (error) {
  const details = error as Error & { code?: string; severity?: string };
  console.error("One-time session rate migration failed:", JSON.stringify({
    name: details.name,
    message: details.message,
    code: details.code,
    severity: details.severity,
  }));
  throw error;
} finally {
  await sql.end();
}
