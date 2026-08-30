import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

const mockedDatabase = vi.hoisted(() => ({
  execute: undefined as ((query: unknown) => Promise<unknown>) | undefined,
}));

vi.mock("@/db/client", () => ({
  getDb: () => ({
    execute: (query: unknown) => {
      if (!mockedDatabase.execute) throw new Error("Test database is not ready.");
      return mockedDatabase.execute(query);
    },
  }),
}));

import { reconcileShiftInvoiceLinks } from "./shifts";

const residencyA = "00000000-0000-4000-8000-000000000001";
const residencyB = "00000000-0000-4000-8000-000000000002";
const invoiceExact = "00000000-0000-4000-8000-000000000011";

let database: PGlite;

beforeAll(async () => {
  database = await PGlite.create();
  const testDatabase = drizzle(database);
  mockedDatabase.execute = async (query) => ({
    rows: (await testDatabase.execute(query as Parameters<typeof testDatabase.execute>[0])).rows,
  });
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
  `);
});

beforeEach(async () => {
  await database.exec("TRUNCATE shifts, invoices;");
});

afterAll(async () => {
  mockedDatabase.execute = undefined;
  await database.close();
});

describe("Shift invoice-link reconciliation", () => {
  it("batches every legacy coverage outcome without changing reconciliation behavior", async () => {
    await database.exec(`
      INSERT INTO invoices (id, residency_id, billing_period_start, billing_period_end, kind, status) VALUES
        ('${invoiceExact}', '${residencyA}', '2026-09-01', '2026-09-07', 'scheduled_period', 'draft'),
        ('00000000-0000-4000-8000-000000000012', '${residencyA}', '2026-09-10', '2026-09-15', 'scheduled_period', 'draft'),
        ('00000000-0000-4000-8000-000000000013', '${residencyA}', '2026-09-12', '2026-09-18', 'scheduled_period', 'sent'),
        ('00000000-0000-4000-8000-000000000014', '${residencyA}', '2026-09-20', '2026-09-20', 'custom', 'draft'),
        ('00000000-0000-4000-8000-000000000015', '${residencyA}', '2026-09-25', '2026-09-25', 'scheduled_period', 'void'),
        ('00000000-0000-4000-8000-000000000016', '${residencyB}', '2026-09-01', '2026-09-30', 'scheduled_period', 'draft');
      INSERT INTO shifts (id, residency_id, invoice_id, service_date, billing_status, invoice_link_issue, invoice_link_note) VALUES
        ('00000000-0000-4000-8000-000000000021', '${residencyA}', '${invoiceExact}', '2026-09-05', 'pending', true, 'Leave linked Shift untouched.'),
        ('00000000-0000-4000-8000-000000000022', '${residencyA}', NULL, '2026-09-05', 'pending', true, 'Stale issue'),
        ('00000000-0000-4000-8000-000000000023', '${residencyA}', NULL, '2026-10-01', 'reviewed', false, ''),
        ('00000000-0000-4000-8000-000000000024', '${residencyA}', NULL, '2026-09-13', 'pending', false, ''),
        ('00000000-0000-4000-8000-000000000025', '${residencyA}', NULL, '2026-09-20', 'pending', false, ''),
        ('00000000-0000-4000-8000-000000000026', '${residencyA}', NULL, '2026-09-25', 'pending', false, ''),
        ('00000000-0000-4000-8000-000000000027', '${residencyA}', NULL, '2026-09-05', 'invoiced', false, ''),
        ('00000000-0000-4000-8000-000000000028', '${residencyB}', NULL, '2026-09-05', 'pending', false, '');
    `);

    await expect(reconcileShiftInvoiceLinks(residencyA)).resolves.toEqual({ processed: 6, changed: 1 });

    const result = await database.query<{
      id: string;
      invoice_id: string | null;
      invoice_link_issue: boolean;
      invoice_link_note: string;
    }>(`
      SELECT id, invoice_id, invoice_link_issue, invoice_link_note
      FROM shifts
      ORDER BY id;
    `);
    expect(result.rows).toEqual([
      { id: "00000000-0000-4000-8000-000000000021", invoice_id: invoiceExact, invoice_link_issue: true, invoice_link_note: "Leave linked Shift untouched." },
      { id: "00000000-0000-4000-8000-000000000022", invoice_id: invoiceExact, invoice_link_issue: false, invoice_link_note: "" },
      { id: "00000000-0000-4000-8000-000000000023", invoice_id: null, invoice_link_issue: true, invoice_link_note: "No Invoice period covers this Shift." },
      { id: "00000000-0000-4000-8000-000000000024", invoice_id: null, invoice_link_issue: true, invoice_link_note: "More than one Invoice covers this Shift." },
      { id: "00000000-0000-4000-8000-000000000025", invoice_id: null, invoice_link_issue: true, invoice_link_note: "No Invoice period covers this Shift." },
      { id: "00000000-0000-4000-8000-000000000026", invoice_id: null, invoice_link_issue: true, invoice_link_note: "No Invoice period covers this Shift." },
      { id: "00000000-0000-4000-8000-000000000027", invoice_id: null, invoice_link_issue: false, invoice_link_note: "" },
      { id: "00000000-0000-4000-8000-000000000028", invoice_id: null, invoice_link_issue: false, invoice_link_note: "" },
    ]);
  });

  it("returns zero counts when a Residency has no eligible Shifts", async () => {
    await expect(reconcileShiftInvoiceLinks(residencyA)).resolves.toEqual({ processed: 0, changed: 0 });
  });
});
