import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

const ids = {
  admin: "00000000-0000-4000-8000-000000000001",
  hotel: "00000000-0000-4000-8000-000000000002",
  clientA: "00000000-0000-4000-8000-000000000010",
  clientB: "00000000-0000-4000-8000-000000000011",
  residencyA: "00000000-0000-4000-8000-000000000020",
  residencyB: "00000000-0000-4000-8000-000000000021",
  daypartA: "00000000-0000-4000-8000-000000000025",
  daypartB: "00000000-0000-4000-8000-000000000026",
  talent: "00000000-0000-4000-8000-000000000030",
  invoiceA: "00000000-0000-4000-8000-000000000040",
  shiftA: "00000000-0000-4000-8000-000000000050",
  shiftB: "00000000-0000-4000-8000-000000000051",
  lead: "00000000-0000-4000-8000-000000000060",
};

let database: PGlite;

beforeAll(async () => {
  database = await PGlite.create({ extensions: { btree_gist } });
  const initial = await readFile(new URL("../drizzle/0000_open_felicia_hardy.sql", import.meta.url), "utf8");
  const onboarding = await readFile(new URL("../drizzle/0001_deep_doctor_faustus.sql", import.meta.url), "utf8");
  const rowSecurity = await readFile(new URL("../drizzle/0002_enable_rls.sql", import.meta.url), "utf8");
  const residencyParity = await readFile(new URL("../drizzle/0003_past_sentry.sql", import.meta.url), "utf8");
  const daypartProjection = await readFile(new URL("../drizzle/0004_demonic_susan_delgado.sql", import.meta.url), "utf8");
  const oneTimeSlots = await readFile(new URL("../drizzle/0005_chief_harrier.sql", import.meta.url), "utf8");
  const nativeInvoicePdf = await readFile(new URL("../drizzle/0006_fine_saracen.sql", import.meta.url), "utf8");
  const invoiceBranding = await readFile(new URL("../drizzle/0007_worthless_titanium_man.sql", import.meta.url), "utf8");
  const residencyInvoiceWorkspace = await readFile(new URL("../drizzle/0008_colorful_sunspot.sql", import.meta.url), "utf8");
  const pipelineFoundation = await readFile(new URL("../drizzle/0009_peaceful_ironclad.sql", import.meta.url), "utf8");
  const airtableTalent = await readFile(new URL("../drizzle/0010_lovely_hobgoblin.sql", import.meta.url), "utf8");
  const airtableLabels = await readFile(new URL("../drizzle/0011_tranquil_vin_gonzales.sql", import.meta.url), "utf8");
  const paymentCleanup = await readFile(new URL("../drizzle/0012_married_butterfly.sql", import.meta.url), "utf8");
  const artistArchive = await readFile(new URL("../drizzle/0013_exotic_scourge.sql", import.meta.url), "utf8");
  const residencyAccess = await readFile(new URL("../drizzle/0014_glamorous_owl.sql", import.meta.url), "utf8");
  await database.exec(initial.replaceAll("--> statement-breakpoint", ""));
  await database.exec(onboarding);
  await database.exec(rowSecurity.replaceAll("--> statement-breakpoint", ""));
  await database.exec(residencyParity.replaceAll("--> statement-breakpoint", ""));
  await database.exec(daypartProjection.replaceAll("--> statement-breakpoint", ""));
  await database.exec(oneTimeSlots.replaceAll("--> statement-breakpoint", ""));
  await database.exec(nativeInvoicePdf.replaceAll("--> statement-breakpoint", ""));
  await database.exec(invoiceBranding.replaceAll("--> statement-breakpoint", ""));
  await database.exec(residencyInvoiceWorkspace.replaceAll("--> statement-breakpoint", ""));
  await database.exec(pipelineFoundation.replaceAll("--> statement-breakpoint", ""));
  await database.exec(airtableTalent.replaceAll("--> statement-breakpoint", ""));
  await database.exec(airtableLabels.replaceAll("--> statement-breakpoint", ""));
  await database.exec(paymentCleanup.replaceAll("--> statement-breakpoint", ""));
  await database.exec(artistArchive.replaceAll("--> statement-breakpoint", ""));
  await database.exec(residencyAccess.replaceAll("--> statement-breakpoint", ""));
  await database.exec(`
    INSERT INTO users (id, email, display_name, role) VALUES
      ('${ids.admin}', 'admin@hfy.test', 'Admin', 'internal_admin'),
      ('${ids.hotel}', 'hotel@example.test', 'Hotel', 'hotel_user');
    INSERT INTO client_accounts (id, name) VALUES
      ('${ids.clientA}', 'Client A'), ('${ids.clientB}', 'Client B');
    INSERT INTO residencies
      (id, client_account_id, slug, name, invoice_prefix, default_talent_rate_cents, client_hourly_rate_cents)
    VALUES
      ('${ids.residencyA}', '${ids.clientA}', 'hotel-a', 'Hotel A', 'HTLA', 8000, 10000),
      ('${ids.residencyB}', '${ids.clientB}', 'hotel-b', 'Hotel B', 'HTLB', 9000, 12000);
    INSERT INTO residency_memberships (user_id, residency_id) VALUES ('${ids.hotel}', '${ids.residencyA}');
    INSERT INTO dayparts (id, residency_id, name, room, sort_order)
    VALUES
      ('${ids.daypartA}', '${ids.residencyA}', 'Pool', 'Pool', 10),
      ('${ids.daypartB}', '${ids.residencyA}', 'Amigo Room', 'Amigo Room', 20);
    INSERT INTO daypart_day_rules (daypart_id, weekday, start_minute, end_minute, default_dj_count)
    VALUES
      ('${ids.daypartA}', 5, 720, 1140, 2),
      ('${ids.daypartA}', 6, 720, 1140, 2),
      ('${ids.daypartA}', 0, 720, 1140, 2),
      ('${ids.daypartB}', 5, 1260, 1440, 1),
      ('${ids.daypartB}', 6, 1260, 1440, 1);
    INSERT INTO talent (id, stage_name, roster_status, talent_status) VALUES
      ('${ids.talent}', 'DJ Constraint', 'ready', 'active');
    INSERT INTO invoices
      (id, residency_id, invoice_number, billing_period_start, billing_period_end, invoice_date, payment_terms_days)
    VALUES
      ('${ids.invoiceA}', '${ids.residencyA}', 'HTLA-001', '2026-09-01', '2026-09-07', '2026-09-07', 7);
    INSERT INTO shifts
      (id, residency_id, daypart_id, invoice_id, name, service_date, room, starts_at, ends_at, client_rate_cents)
    VALUES
      ('${ids.shiftA}', '${ids.residencyA}', '${ids.daypartA}', '${ids.invoiceA}', 'Pool', '2026-09-05', 'Pool', '2026-09-05T19:00:00Z', '2026-09-06T02:00:00Z', 10000),
      ('${ids.shiftB}', '${ids.residencyB}', NULL, NULL, 'Lobby', '2026-09-05', 'Lobby', '2026-09-05T20:00:00Z', '2026-09-06T03:00:00Z', 12000);
  `);
});

afterAll(async () => {
  await database.close();
});

describe("database replacements for Airtable audit formulas", () => {
  it("enables deny-by-default row security on every business table", async () => {
    const result = await database.query<{ relname: string }>(`
      SELECT relname
      FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relkind = 'r'
        AND NOT relrowsecurity;
    `);
    expect(result.rows).toEqual([]);
  });

  it("stores a separate contact and an explicit client access role", async () => {
    await database.exec(`
      INSERT INTO residency_contacts (residency_id, name, email, access_role, is_primary)
      VALUES ('${ids.residencyA}', 'Calendar Contact', 'calendar@example.test', 'calendar_viewer', true);
      UPDATE residency_memberships
      SET access_role = 'calendar_viewer'
      WHERE user_id = '${ids.hotel}' AND residency_id = '${ids.residencyA}';
    `);
    const contact = await database.query<{ access_role: string; is_primary: boolean }>(`
      SELECT access_role, is_primary FROM residency_contacts WHERE email = 'calendar@example.test';
    `);
    const membership = await database.query<{ access_role: string }>(`
      SELECT access_role FROM residency_memberships WHERE user_id = '${ids.hotel}';
    `);
    expect(contact.rows[0]).toEqual({ access_role: "calendar_viewer", is_primary: true });
    expect(membership.rows[0]?.access_role).toBe("calendar_viewer");
  });

  it("requires exactly one valid Shift parent", async () => {
    await expect(database.exec(`
      INSERT INTO assignments
        (shift_id, set_name, starts_at, ends_at, compensation_type, talent_rate_cents)
      VALUES
        ('99999999-0000-4000-8000-000000000000', 'Orphan', '2026-09-05T20:00:00Z', '2026-09-05T21:00:00Z', 'hourly', 8000);
    `)).rejects.toThrow();
  });

  it("keeps one independent hours rule per Daypart weekday", async () => {
    await expect(database.exec(`
      INSERT INTO daypart_day_rules (daypart_id, weekday, start_minute, end_minute, default_dj_count)
      VALUES ('${ids.daypartA}', 5, 780, 1080, 1);
    `)).rejects.toThrow();

    const result = await database.query<{ start_minute: number; end_minute: number; default_dj_count: number }>(`
      SELECT start_minute, end_minute, default_dj_count
      FROM daypart_day_rules
      WHERE daypart_id = '${ids.daypartA}' AND weekday = 0;
    `);
    expect(result.rows[0]).toEqual({ start_minute: 720, end_minute: 1140, default_dj_count: 2 });
  });

  it("pre-suggests both Ace Dayparts with exact hours on a Friday", async () => {
    const result = await database.query<{ name: string; room: string; start_minute: number; end_minute: number; default_dj_count: number }>(`
      SELECT d.name, d.room, r.start_minute, r.end_minute, r.default_dj_count
      FROM dayparts d
      JOIN daypart_day_rules r ON r.daypart_id = d.id
      WHERE d.residency_id = '${ids.residencyA}'
        AND d.active
        AND r.weekday = EXTRACT(DOW FROM DATE '2026-09-04')
      ORDER BY d.sort_order;
    `);
    expect(result.rows).toEqual([
      { name: "Pool", room: "Pool", start_minute: 720, end_minute: 1140, default_dj_count: 2 },
      { name: "Amigo Room", room: "Amigo Room", start_minute: 1260, end_minute: 1440, default_dj_count: 1 },
    ]);
  });

  it("rejects invalid weekly hours and DJ counts", async () => {
    await expect(database.exec(`
      INSERT INTO daypart_day_rules (daypart_id, weekday, start_minute, end_minute, default_dj_count)
      VALUES ('${ids.daypartA}', 2, 900, 800, 0);
    `)).rejects.toThrow();
  });

  it("allows only one dated Shift for a Daypart", async () => {
    await expect(database.exec(`
      INSERT INTO shifts
        (residency_id, daypart_id, name, service_date, room, starts_at, ends_at, client_rate_cents)
      VALUES
        ('${ids.residencyA}', '${ids.daypartA}', 'Duplicate Pool', '2026-09-05', 'Pool Deck', '2026-09-05T19:00:00Z', '2026-09-06T02:00:00Z', 10000);
    `)).rejects.toThrow();
  });

  it("stores a valid color on a one-time calendar Shift and rejects an invalid one", async () => {
    await database.exec(`
      INSERT INTO shifts
        (residency_id, daypart_id, name, service_date, room, calendar_color, starts_at, ends_at, client_rate_cents)
      VALUES
        ('${ids.residencyA}', NULL, 'Movie Night', '2026-09-10', 'Pool', '#7A65D1', '2026-09-11T01:00:00Z', '2026-09-11T04:00:00Z', 10000);
    `);
    const result = await database.query<{ calendar_color: string }>(`SELECT calendar_color FROM shifts WHERE name = 'Movie Night';`);
    expect(result.rows[0].calendar_color).toBe("#7A65D1");

    await expect(database.exec(`
      INSERT INTO shifts
        (residency_id, daypart_id, name, service_date, room, calendar_color, starts_at, ends_at, client_rate_cents)
      VALUES
        ('${ids.residencyA}', NULL, 'Bad Color', '2026-09-11', 'Pool', 'purple', '2026-09-12T01:00:00Z', '2026-09-12T04:00:00Z', 10000);
    `)).rejects.toThrow();
  });

  it("prevents a Shift from using another Residency's Daypart", async () => {
    await expect(database.exec(`
      INSERT INTO shifts
        (residency_id, daypart_id, name, service_date, room, starts_at, ends_at, client_rate_cents)
      VALUES
        ('${ids.residencyB}', '${ids.daypartB}', 'Cross-residency Daypart', '2026-09-06', 'Amigo Room', '2026-09-07T04:00:00Z', '2026-09-07T07:00:00Z', 12000);
    `)).rejects.toThrow();
  });

  it("rejects Assignment times outside the parent Shift", async () => {
    await expect(database.exec(`
      INSERT INTO assignments
        (shift_id, talent_id, set_name, starts_at, ends_at, compensation_type, talent_rate_cents)
      VALUES
        ('${ids.shiftA}', '${ids.talent}', 'Outside', '2026-09-05T18:00:00Z', '2026-09-05T21:00:00Z', 'hourly', 8000);
    `)).rejects.toThrow(/within its Shift/);
  });

  it("requires a Residency-approved active DJ for hotel selections", async () => {
    await expect(database.exec(`
      INSERT INTO assignments
        (shift_id, talent_id, source, set_name, starts_at, ends_at, booking_status, compensation_type, talent_rate_cents)
      VALUES
        ('${ids.shiftA}', '${ids.talent}', 'hotel', 'Unapproved', '2026-09-05T20:00:00Z', '2026-09-05T22:00:00Z', 'pending_hfy_confirmation', 'hourly', 8000);
    `)).rejects.toThrow(/approved DJ/);
  });

  it("forces hotel selections into Pending HFY Confirmation", async () => {
    await database.exec(`INSERT INTO residency_talent (residency_id, talent_id) VALUES ('${ids.residencyA}', '${ids.talent}');`);
    await expect(database.exec(`
      INSERT INTO assignments
        (shift_id, talent_id, source, set_name, starts_at, ends_at, booking_status, compensation_type, talent_rate_cents)
      VALUES
        ('${ids.shiftA}', '${ids.talent}', 'hotel', 'Direct confirm', '2026-09-05T20:00:00Z', '2026-09-05T22:00:00Z', 'confirmed', 'hourly', 8000);
    `)).rejects.toThrow(/Pending HFY Confirmation/);
  });

  it("blocks overlapping active bookings across Residencies", async () => {
    await database.exec(`
      INSERT INTO residency_talent (residency_id, talent_id) VALUES ('${ids.residencyB}', '${ids.talent}');
      INSERT INTO assignments
        (shift_id, talent_id, source, set_name, starts_at, ends_at, booking_status, compensation_type, talent_rate_cents)
      VALUES
        ('${ids.shiftA}', '${ids.talent}', 'hotel', 'First request', '2026-09-05T20:00:00Z', '2026-09-05T22:00:00Z', 'pending_hfy_confirmation', 'hourly', 8000);
    `);
    await expect(database.exec(`
      INSERT INTO assignments
        (shift_id, talent_id, source, set_name, starts_at, ends_at, booking_status, compensation_type, talent_rate_cents)
      VALUES
        ('${ids.shiftB}', '${ids.talent}', 'hotel', 'Overlapping request', '2026-09-05T21:00:00Z', '2026-09-05T23:00:00Z', 'pending_hfy_confirmation', 'hourly', 9000);
    `)).rejects.toThrow();
  });

  it("prevents a Shift from linking to another Residency's Invoice", async () => {
    await expect(database.exec(`UPDATE shifts SET invoice_id = '${ids.invoiceA}' WHERE id = '${ids.shiftB}';`)).rejects.toThrow();
  });

  it("prevents overlapping active Invoice periods", async () => {
    await expect(database.exec(`
      INSERT INTO invoices
        (residency_id, invoice_number, billing_period_start, billing_period_end, invoice_date, payment_terms_days)
      VALUES
        ('${ids.residencyA}', 'HTLA-002', '2026-09-07', '2026-09-14', '2026-09-14', 7);
    `)).rejects.toThrow();
  });

  it("allows a custom Invoice to overlap a scheduled billing period without becoming Shift coverage", async () => {
    await database.exec(`
      INSERT INTO invoices
        (residency_id, invoice_number, billing_period_start, billing_period_end, invoice_date, payment_terms_days, kind, total_cents)
      VALUES
        ('${ids.residencyA}', 'HTLA-CUSTOM-001', '2026-09-04', '2026-09-05', '2026-09-05', 7, 'custom', 50000);
    `);
    const result = await database.query<{ kind: string }>(`SELECT kind FROM invoices WHERE invoice_number = 'HTLA-CUSTOM-001';`);
    expect(result.rows[0].kind).toBe("custom");
  });

  it("rejects invalid Residency billing-cycle settings", async () => {
    await expect(database.exec(`UPDATE residencies SET billing_cycle_start_weekday = 7 WHERE id = '${ids.residencyA}';`)).rejects.toThrow();
    await expect(database.exec(`UPDATE residencies SET billing_cycle_length_days = 0 WHERE id = '${ids.residencyA}';`)).rejects.toThrow();
  });

  it("converts a Won Lead in place into the same Operations Residency record", async () => {
    await database.exec(`
      INSERT INTO residencies
        (id, client_account_id, slug, name, invoice_prefix, operating_mode, lead_source, pipeline_status, primary_contact_name, lead_notes)
      VALUES
        ('${ids.lead}', '${ids.clientB}', 'future-hotel-lead', 'Future Hotel', 'LEAD-FUTURE', 'pipeline', 'inbound', 'proposal_sent', 'Jamie Lee', 'Discovery notes stay here.');
      UPDATE residencies
      SET operating_mode = 'operations', pipeline_status = 'won', city_state = 'Los Angeles, CA', invoice_prefix = 'FUTURE', converted_at = now()
      WHERE id = '${ids.lead}';
    `);
    const result = await database.query<{ id: string; operating_mode: string; pipeline_status: string; lead_notes: string }>(`
      SELECT id, operating_mode, pipeline_status, lead_notes FROM residencies WHERE id = '${ids.lead}';
    `);
    expect(result.rows[0]).toEqual({
      id: ids.lead,
      operating_mode: "operations",
      pipeline_status: "won",
      lead_notes: "Discovery notes stay here.",
    });
  });

  it("keeps Lost Leads in Pipeline instead of deleting them", async () => {
    await database.exec(`UPDATE residencies SET operating_mode = 'pipeline', pipeline_status = 'lost', converted_at = NULL WHERE id = '${ids.lead}';`);
    const result = await database.query<{ count: number }>(`
      SELECT count(*)::int AS count FROM residencies WHERE id = '${ids.lead}' AND operating_mode = 'pipeline' AND pipeline_status = 'lost';
    `);
    expect(result.rows[0].count).toBe(1);
  });

  it("prevents Paid without amount, date, and reference", async () => {
    await expect(database.exec(`
      INSERT INTO assignments
        (shift_id, set_name, starts_at, ends_at, booking_status, compensation_type, talent_rate_cents, total_compensation_cents, payout_status)
      VALUES
        ('${ids.shiftA}', 'Invalid payout', '2026-09-05T22:00:00Z', '2026-09-05T23:00:00Z', 'completed', 'hourly', 8000, 8000, 'paid');
    `)).rejects.toThrow();
  });

  it("rejects invalid native Invoice PDF metadata", async () => {
    await expect(database.exec(`UPDATE invoices SET pdf_byte_size = -1 WHERE id = '${ids.invoiceA}';`)).rejects.toThrow();
  });

  it("requires complete metadata for a saved Invoice logo", async () => {
    await expect(database.exec(`
      INSERT INTO platform_settings (id, invoice_logo_storage_path)
      VALUES ('00000000-0000-4000-8000-0000000000f1', 'invoice-branding/incomplete.png');
    `)).rejects.toThrow();
  });
});
