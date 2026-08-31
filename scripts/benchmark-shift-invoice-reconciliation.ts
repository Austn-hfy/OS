import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { shiftInvoiceReconciliationStatement } from "../src/services/shifts";

type Summary = { processed: number; changed: number };
type Sample = Summary & { durationMs: number; queries: number };

const residencyId = "00000000-0000-4000-8000-000000000001";
const invoiceId = "00000000-0000-4000-8000-000000000011";

function integerArgument(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function scaleArgument() {
  const raw = process.argv.find((argument) => argument.startsWith("--scales="))?.slice("--scales=".length);
  if (!raw) return [100, 1_000, 5_000];
  const scales = raw.split(",").map(Number).filter((value) => Number.isInteger(value) && value > 0);
  if (!scales.length) throw new Error("At least one positive benchmark scale is required.");
  return scales;
}

function percentile(values: number[], quantile: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)];
}

function summarize(samples: Sample[]) {
  const durations = samples.map((sample) => sample.durationMs);
  const queries = samples.map((sample) => sample.queries);
  return {
    queries: { min: Math.min(...queries), max: Math.max(...queries) },
    durationMs: {
      min: Number(Math.min(...durations).toFixed(2)),
      median: Number(percentile(durations, 0.5).toFixed(2)),
      p95: Number(percentile(durations, 0.95).toFixed(2)),
      max: Number(Math.max(...durations).toFixed(2)),
      mean: Number((durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(2)),
    },
  };
}

async function createFixture(shiftCount: number) {
  const database = await PGlite.create();
  await database.exec(`
    CREATE TYPE billing_status AS ENUM ('pending', 'reviewed', 'invoiced', 'not_billable');
    CREATE TYPE invoice_kind AS ENUM ('scheduled_period', 'custom');
    CREATE TYPE invoice_status AS ENUM ('draft', 'approved', 'sent', 'paid', 'void');
    CREATE TABLE invoices (
      id uuid PRIMARY KEY,
      residency_id uuid NOT NULL,
      billing_period_start date NOT NULL,
      billing_period_end date NOT NULL,
      kind invoice_kind NOT NULL,
      status invoice_status NOT NULL
    );
    CREATE TABLE shifts (
      id uuid PRIMARY KEY,
      residency_id uuid NOT NULL,
      invoice_id uuid,
      service_date date NOT NULL,
      billing_status billing_status NOT NULL,
      invoice_link_issue boolean NOT NULL DEFAULT false,
      invoice_link_note text NOT NULL DEFAULT '',
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX invoices_residency_period_idx
      ON invoices (residency_id, billing_period_start, billing_period_end);
    CREATE INDEX shifts_residency_date_idx ON shifts (residency_id, service_date);
    INSERT INTO invoices (id, residency_id, billing_period_start, billing_period_end, kind, status)
    VALUES ('${invoiceId}', '${residencyId}', '2026-09-01', '2026-09-30', 'scheduled_period', 'draft');
    INSERT INTO shifts (id, residency_id, service_date, billing_status)
    SELECT md5('shift-' || sequence)::uuid, '${residencyId}', '2026-09-15', 'pending'
    FROM generate_series(1, ${shiftCount}) AS sequence;
  `);
  return database;
}

async function resetFixture(database: PGlite) {
  await database.exec("UPDATE shifts SET invoice_id = NULL, invoice_link_issue = false, invoice_link_note = '';");
}

async function verifyFixture(database: PGlite, shiftCount: number, summary: Summary) {
  if (summary.processed !== shiftCount || summary.changed !== shiftCount) {
    throw new Error(`Unexpected reconciliation summary: ${JSON.stringify(summary)}`);
  }
  const linked = await database.query<{ count: number }>(
    "SELECT count(*)::integer AS count FROM shifts WHERE invoice_id = $1;",
    [invoiceId],
  );
  if (linked.rows[0]?.count !== shiftCount) throw new Error(`Only ${linked.rows[0]?.count ?? 0} Shifts were linked.`);
}

async function legacyReconcile(database: PGlite): Promise<Sample> {
  let queries = 0;
  const startedAt = performance.now();
  queries += 1;
  const eligible = await database.query<{ id: string; invoice_id: string | null; service_date: string }>(`
    SELECT *
    FROM shifts
    WHERE residency_id = $1
      AND billing_status IN ('pending', 'reviewed');
  `, [residencyId]);
  let changed = 0;
  for (const shift of eligible.rows.filter((candidate) => !candidate.invoice_id)) {
    queries += 1;
    const covering = await database.query<{ id: string }>(`
      SELECT id
      FROM invoices
      WHERE residency_id = $1
        AND kind = 'scheduled_period'
        AND billing_period_start <= $2
        AND billing_period_end >= $2
        AND status <> 'void';
    `, [residencyId, shift.service_date]);
    queries += 1;
    if (covering.rows.length === 1) {
      await database.query(`
        UPDATE shifts
        SET invoice_id = $1, invoice_link_issue = false, invoice_link_note = '', updated_at = now()
        WHERE id = $2;
      `, [covering.rows[0].id, shift.id]);
      changed += 1;
    } else {
      await database.query(`
        UPDATE shifts
        SET
          invoice_link_issue = true,
          invoice_link_note = $1,
          updated_at = now()
        WHERE id = $2;
      `, [covering.rows.length ? "More than one Invoice covers this Shift." : "No Invoice period covers this Shift.", shift.id]);
    }
  }
  return { processed: eligible.rows.length, changed, queries, durationMs: performance.now() - startedAt };
}

async function batchedReconcile(database: PGlite): Promise<Sample> {
  const testDatabase = drizzle(database);
  const startedAt = performance.now();
  const result = await testDatabase.execute<{ processed: number; changed: number }>(shiftInvoiceReconciliationStatement(residencyId));
  const summary = result.rows[0];
  return {
    processed: Number(summary.processed),
    changed: Number(summary.changed),
    queries: 1,
    durationMs: performance.now() - startedAt,
  };
}

const samplesPerVariant = integerArgument("samples", 10);
const warmups = integerArgument("warmups", 2);
const results = [];

for (const shiftCount of scaleArgument()) {
  const database = await createFixture(shiftCount);
  const legacySamples: Sample[] = [];
  const batchedSamples: Sample[] = [];
  for (let iteration = 0; iteration < warmups + samplesPerVariant; iteration += 1) {
    const variants = iteration % 2 === 0
      ? [[legacyReconcile, legacySamples], [batchedReconcile, batchedSamples]] as const
      : [[batchedReconcile, batchedSamples], [legacyReconcile, legacySamples]] as const;
    for (const [reconcile, samples] of variants) {
      await resetFixture(database);
      const sample = await reconcile(database);
      await verifyFixture(database, shiftCount, sample);
      if (iteration >= warmups) samples.push(sample);
    }
  }
  const legacy = summarize(legacySamples);
  const batched = summarize(batchedSamples);
  results.push({
    unlinkedShifts: shiftCount,
    samplesPerVariant,
    legacy,
    batched,
    medianSpeedup: Number((legacy.durationMs.median / batched.durationMs.median).toFixed(2)),
    queryReductionPercent: Number((100 * (1 - batched.queries.max / legacy.queries.max)).toFixed(3)),
  });
  await database.close();
}

process.stdout.write(`${JSON.stringify({
  engine: "PGlite (ephemeral PostgreSQL-compatible database)",
  methodology: "Alternating variant order; fixture reset and result verification excluded from timing",
  warmupsPerVariant: warmups,
  results,
}, null, 2)}\n`);
