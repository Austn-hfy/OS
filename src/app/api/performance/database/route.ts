import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDatabaseRuntimeDiagnostics, getDb } from "@/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const instanceId = randomUUID();
const MAX_QUERIES = 50;
const MAX_CONCURRENCY = 10;

function boundedInteger(value: string | null, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function percentile(values: number[], quantile: number) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1);
  return Number(sorted[index].toFixed(2));
}

async function timedQuery() {
  const startedAt = performance.now();
  await getDb().execute(sql`select 1 as ok`);
  return performance.now() - startedAt;
}

async function verifyRollback() {
  let rolledBack = false;
  const startedAt = performance.now();

  try {
    await getDb().transaction(async (transaction) => {
      await transaction.execute(sql`select 1 as ok`);
      throw new Error("EXPECTED_ROLLBACK");
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "EXPECTED_ROLLBACK") throw error;
    rolledBack = true;
  }

  await getDb().execute(sql`select 1 as ok`);
  return {
    rolledBack,
    nextQuerySucceeded: true,
    durationMs: Number((performance.now() - startedAt).toFixed(2)),
  };
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== "preview") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const requestUrl = new URL(request.url);
  const queryCount = boundedInteger(requestUrl.searchParams.get("queries"), 10, MAX_QUERIES);
  const concurrency = boundedInteger(requestUrl.searchParams.get("concurrency"), 1, MAX_CONCURRENCY);

  const initial = getDatabaseRuntimeDiagnostics();
  const warmupMs = await timedQuery();
  const before = getDatabaseRuntimeDiagnostics();
  const timings: number[] = [];
  const startedAt = performance.now();

  for (let offset = 0; offset < queryCount; offset += concurrency) {
    const batchSize = Math.min(concurrency, queryCount - offset);
    timings.push(...await Promise.all(Array.from({ length: batchSize }, timedQuery)));
  }

  const rollback = await verifyRollback();
  const durationMs = performance.now() - startedAt;
  const after = getDatabaseRuntimeDiagnostics();

  return Response.json({
    ok: true,
    environment: "preview",
    functionRegion: process.env.VERCEL_REGION ?? null,
    gitBranch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    instanceId,
    database: after.connection,
    lifecycle: after.lifecycle,
    pool: { initial: initial.pool, before: before.pool, after: after.pool },
    rollback,
    sample: {
      queries: queryCount,
      concurrency,
      warmupMs: Number(warmupMs.toFixed(2)),
      totalDurationMs: Number(durationMs.toFixed(2)),
      minMs: Number(Math.min(...timings).toFixed(2)),
      medianMs: percentile(timings, 0.5),
      p95Ms: percentile(timings, 0.95),
      maxMs: Number(Math.max(...timings).toFixed(2)),
    },
  }, {
    headers: {
      "Cache-Control": "no-store",
      "Server-Timing": `database;dur=${durationMs.toFixed(2)}`,
    },
  });
}
