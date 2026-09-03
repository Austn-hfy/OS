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
  exclusiveTalent: "00000000-0000-4000-8000-000000000031",
  invoiceA: "00000000-0000-4000-8000-000000000040",
  shiftA: "00000000-0000-4000-8000-000000000050",
  shiftB: "00000000-0000-4000-8000-000000000051",
  lead: "00000000-0000-4000-8000-000000000060",
  clientOwnedTalent: "00000000-0000-4000-8000-000000000070",
  clientOwnedShift: "00000000-0000-4000-8000-000000000071",
  clientOwnedAssignment: "00000000-0000-4000-8000-000000000072",
  hfyRequestShift: "00000000-0000-4000-8000-000000000073",
  hfyRequest: "00000000-0000-4000-8000-000000000074",
  platformSubscription: "00000000-0000-4000-8000-000000000080",
  platformInvoice: "00000000-0000-4000-8000-000000000081",
  finalizedMonthlyInvoice: "00000000-0000-4000-8000-000000000082",
  laterMonthlyInvoice: "00000000-0000-4000-8000-000000000083",
  talentAdjustment: "00000000-0000-4000-8000-000000000084",
  talentScheduleLock: "00000000-0000-4000-8000-000000000085",
  privateEligibleTalent: "00000000-0000-4000-8000-000000000086",
  privateEligibleShift: "00000000-0000-4000-8000-000000000087",
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
  const publicCalendars = await readFile(new URL("../drizzle/0015_superb_norrin_radd.sql", import.meta.url), "utf8");
  const daypartTypes = await readFile(new URL("../drizzle/0016_daypart_types_and_schedule_occurrences.sql", import.meta.url), "utf8");
  const publicCalendarScopes = await readFile(new URL("../drizzle/0017_cold_silhouette.sql", import.meta.url), "utf8");
  const flexibleDayparts = await readFile(new URL("../drizzle/0018_flashy_frightful_four.sql", import.meta.url), "utf8");
  const realResidencyBoundary = await readFile(new URL("../drizzle/0019_sudden_lucky_pierre.sql", import.meta.url), "utf8");
  const internalTestAccounts = await readFile(new URL("../drizzle/0020_supreme_dark_beast.sql", import.meta.url), "utf8");
  const accountSetupTokens = await readFile(new URL("../drizzle/0021_account_setup_tokens.sql", import.meta.url), "utf8");
  const daypartDateExceptions = await readFile(new URL("../drizzle/0024_ambitious_doctor_faustus.sql", import.meta.url), "utf8");
  const explicitResidencyRoster = await readFile(new URL("../drizzle/0025_explicit_residency_roster_visibility.sql", import.meta.url), "utf8");
  const clientOwnershipBoundary = await readFile(new URL("../drizzle/0026_fine_tyrannus.sql", import.meta.url), "utf8");
  const oneTimeHouseActivities = await readFile(new URL("../drizzle/0028_one_time_house_activities.sql", import.meta.url), "utf8");
  const calendarOnlyDayparts = await readFile(new URL("../drizzle/0029_calendar_only_dayparts.sql", import.meta.url), "utf8");
  const clientDaypartRates = await readFile(new URL("../drizzle/0030_warm_newton_destine.sql", import.meta.url), "utf8");
  const separatedFinancials = await readFile(new URL("../drizzle/0031_dazzling_jack_power.sql", import.meta.url), "utf8");
  const clientArtistVisibility = await readFile(new URL("../drizzle/0032_fast_surge.sql", import.meta.url), "utf8");
  const oneTimeSessionRates = await readFile(new URL("../drizzle/0034_one_time_session_artist_rate.sql", import.meta.url), "utf8");
  const roomColorSystem = await readFile(new URL("../drizzle/0036_room_color_system.sql", import.meta.url), "utf8");
  // Supabase provides these PostgREST roles. PGlite starts with neither, so
  // create them before applying migrations that explicitly revoke access.
  await database.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';
  `);
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
  await database.exec(publicCalendars.replaceAll("--> statement-breakpoint", ""));
  await database.exec(daypartTypes.replaceAll("--> statement-breakpoint", ""));
  await database.exec(publicCalendarScopes.replaceAll("--> statement-breakpoint", ""));
  await database.exec(flexibleDayparts.replaceAll("--> statement-breakpoint", ""));
  await database.exec(realResidencyBoundary.replaceAll("--> statement-breakpoint", ""));
  await database.exec(internalTestAccounts.replaceAll("--> statement-breakpoint", ""));
  await database.exec(accountSetupTokens.replaceAll("--> statement-breakpoint", ""));
  await database.exec(daypartDateExceptions.replaceAll("--> statement-breakpoint", ""));
  await database.exec(explicitResidencyRoster.replaceAll("--> statement-breakpoint", ""));
  await database.exec(clientOwnershipBoundary.replaceAll("--> statement-breakpoint", ""));
  await database.exec(oneTimeHouseActivities.replaceAll("--> statement-breakpoint", ""));
  await database.exec(calendarOnlyDayparts.replaceAll("--> statement-breakpoint", ""));
  await database.exec(clientDaypartRates.replaceAll("--> statement-breakpoint", ""));
  await database.exec(separatedFinancials.replaceAll("--> statement-breakpoint", ""));
  await database.exec(clientArtistVisibility.replaceAll("--> statement-breakpoint", ""));
  await database.exec(oneTimeSessionRates.replaceAll("--> statement-breakpoint", ""));
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
    INSERT INTO talent (id, stage_name, roster_status, talent_status, exclusive_residency_id) VALUES
      ('${ids.exclusiveTalent}', 'Exclusive DJ', 'ready', 'active', '${ids.residencyA}');
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
  await database.exec(roomColorSystem.replaceAll("--> statement-breakpoint", ""));
});

afterAll(async () => {
  await database.close();
});

describe("database replacements for Airtable audit formulas", () => {
  it("backfills persistent rooms, references, and deterministic room shades", async () => {
    const rooms = await database.query<{ name: string; hue: string; sort_order: number }>(`
      SELECT name, hue, sort_order FROM rooms WHERE residency_id = '${ids.residencyA}' ORDER BY sort_order;
    `);
    expect(rooms.rows).toEqual([
      { name: "Amigo Room", hue: "blue", sort_order: 0 },
      { name: "Pool", hue: "orange", sort_order: 1 },
    ]);
    const dayparts = await database.query<{ name: string; color: string; room_id: string | null }>(`
      SELECT name, color, room_id FROM dayparts WHERE residency_id = '${ids.residencyA}' ORDER BY name;
    `);
    expect(dayparts.rows.map((daypart) => ({ name: daypart.name, color: daypart.color, linked: Boolean(daypart.room_id) }))).toEqual([
      { name: "Amigo Room", color: "#1B5FA7", linked: true },
      { name: "Pool", color: "#B95A1E", linked: true },
    ]);
  });

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

  it("keeps Platform subscription invoices in a Residency-scoped ledger", async () => {
    await database.exec(`
      INSERT INTO platform_subscriptions
        (id, residency_id, status, cadence, talent_program_sessions, talent_session_unit_amount_cents, house_programs, house_program_unit_amount_cents)
      VALUES ('${ids.platformSubscription}', '${ids.residencyA}', 'active', 'monthly', 8, 2500, 3, 1000);
      INSERT INTO platform_subscription_invoices
        (id, platform_subscription_id, residency_id, stripe_invoice_id, billing_period_start, billing_period_end, invoice_date, amount_due_cents, amount_paid_cents, status)
      VALUES ('${ids.platformInvoice}', '${ids.platformSubscription}', '${ids.residencyA}', 'in_test_platform_001', '2026-09-01', '2026-09-30', '2026-09-01', 23000, 23000, 'paid');
    `);
    const record = await database.query<{ amount_due_cents: number }>(`
      SELECT amount_due_cents FROM platform_subscription_invoices WHERE id = '${ids.platformInvoice}';
    `);
    expect(record.rows[0]?.amount_due_cents).toBe(23000);
    await expect(database.exec(`
      UPDATE platform_subscription_invoices SET residency_id = '${ids.residencyB}' WHERE id = '${ids.platformInvoice}';
    `)).rejects.toThrow(/must match its subscription Residency/);
  });

  it("locks monthly talent schedules and scopes carry-forward adjustments to their Residency", async () => {
    await database.exec(`
      INSERT INTO invoices
        (id, residency_id, invoice_number, billing_period_start, billing_period_end, invoice_date, payment_terms_days, status, total_cents, pdf_storage_path)
      VALUES
        ('${ids.finalizedMonthlyInvoice}', '${ids.residencyA}', 'HTLA-JAN-FULL', '2027-01-01', '2027-01-31', '2027-01-01', 7, 'approved', 100000, 'invoices/finalized-monthly.pdf'),
        ('${ids.laterMonthlyInvoice}', '${ids.residencyA}', 'HTLA-FEB-FULL', '2027-02-01', '2027-02-28', '2027-02-01', 7, 'draft', 50000, NULL);
      INSERT INTO talent_schedule_locks
        (id, residency_id, service_month, billing_period_start, billing_period_end, invoice_id, locked_by_user_id)
      VALUES ('${ids.talentScheduleLock}', '${ids.residencyA}', '2027-01-01', '2027-01-01', '2027-01-31', '${ids.finalizedMonthlyInvoice}', '${ids.admin}');
      INSERT INTO talent_invoice_adjustments
        (id, residency_id, source_invoice_id, service_date, reason, description, amount_cents, created_by_user_id)
      VALUES ('${ids.talentAdjustment}', '${ids.residencyA}', '${ids.finalizedMonthlyInvoice}', '2027-01-10', 'schedule_cancelled_after_invoice', 'Credit for cancellation', -10000, '${ids.admin}');
      UPDATE talent_invoice_adjustments
      SET status = 'applied', applied_invoice_id = '${ids.laterMonthlyInvoice}', applied_at = now()
      WHERE id = '${ids.talentAdjustment}';
    `);
    const adjustment = await database.query<{ status: string; applied_invoice_id: string }>(`
      SELECT status, applied_invoice_id FROM talent_invoice_adjustments WHERE id = '${ids.talentAdjustment}';
    `);
    expect(adjustment.rows[0]).toEqual({ status: "applied", applied_invoice_id: ids.laterMonthlyInvoice });
    await expect(database.exec(`
      UPDATE talent_invoice_adjustments SET residency_id = '${ids.residencyB}' WHERE id = '${ids.talentAdjustment}';
    `)).rejects.toThrow(/finalized source Invoice for the same Residency/);
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

  it("allows multiple Residency memberships only for flagged internal test accounts", async () => {
    await expect(database.exec(`
      INSERT INTO residency_memberships (user_id, residency_id, access_role)
      VALUES ('${ids.hotel}', '${ids.residencyB}', 'manager');
    `)).rejects.toThrow(/only one active Residency membership/);

    await database.exec(`UPDATE users SET is_internal_test = true WHERE id = '${ids.hotel}';`);
    await database.exec(`
      INSERT INTO residency_memberships (user_id, residency_id, access_role)
      VALUES ('${ids.hotel}', '${ids.residencyB}', 'manager');
    `);
    const memberships = await database.query<{ count: number }>(`
      SELECT count(*)::int AS count FROM residency_memberships WHERE user_id = '${ids.hotel}' AND active = true;
    `);
    expect(memberships.rows[0]?.count).toBe(2);
    await expect(database.exec(`UPDATE users SET is_internal_test = false WHERE id = '${ids.hotel}';`)).rejects.toThrow(/Remove extra Residency memberships/);

    await database.exec(`DELETE FROM residency_memberships WHERE user_id = '${ids.hotel}' AND residency_id = '${ids.residencyB}';`);
    await database.exec(`UPDATE users SET is_internal_test = false WHERE id = '${ids.hotel}';`);
  });

  it("does not allow an internal admin to be labeled as an internal client test account", async () => {
    await expect(database.exec(`UPDATE users SET is_internal_test = true WHERE id = '${ids.admin}';`)).rejects.toThrow();
  });

  it("keeps account setup tokens reusable across reads and consumable exactly once", async () => {
    const tokenHash = "c".repeat(64);
    await database.exec(`
      INSERT INTO account_setup_tokens (user_id, residency_id, token_hash, expires_at)
      VALUES ('${ids.hotel}', '${ids.residencyA}', '${tokenHash}', now() + interval '7 days');
    `);
    const firstRead = await database.query<{ used_at: string | null }>(`
      SELECT used_at FROM account_setup_tokens WHERE token_hash = '${tokenHash}';
    `);
    const secondRead = await database.query<{ used_at: string | null }>(`
      SELECT used_at FROM account_setup_tokens WHERE token_hash = '${tokenHash}';
    `);
    expect(firstRead.rows[0]?.used_at).toBeNull();
    expect(secondRead.rows[0]?.used_at).toBeNull();

    const firstUse = await database.query<{ id: string }>(`
      UPDATE account_setup_tokens
      SET used_at = now()
      WHERE token_hash = '${tokenHash}' AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
      RETURNING id;
    `);
    const secondUse = await database.query<{ id: string }>(`
      UPDATE account_setup_tokens
      SET used_at = now()
      WHERE token_hash = '${tokenHash}' AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
      RETURNING id;
    `);
    expect(firstUse.rows).toHaveLength(1);
    expect(secondUse.rows).toEqual([]);
  });

  it("rotates one hashed public calendar token per Residency and invalidates the old hash", async () => {
    const oldHash = "a".repeat(64);
    const newHash = "b".repeat(64);
    await database.exec(`
      INSERT INTO public_calendar_links (residency_id, token_hash, rotated_by_user_id)
      VALUES ('${ids.residencyA}', '${oldHash}', '${ids.admin}');
      INSERT INTO public_calendar_links (residency_id, token_hash, rotated_by_user_id)
      VALUES ('${ids.residencyA}', '${newHash}', '${ids.admin}')
      ON CONFLICT (residency_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, rotated_at = now();
    `);
    const oldResult = await database.query(`SELECT residency_id FROM public_calendar_links WHERE token_hash = '${oldHash}';`);
    const newResult = await database.query(`SELECT residency_id FROM public_calendar_links WHERE token_hash = '${newHash}';`);
    expect(oldResult.rows).toEqual([]);
    expect(newResult.rows).toHaveLength(1);
    await expect(database.exec(`UPDATE public_calendar_links SET token_hash = 'plaintext-token' WHERE residency_id = '${ids.residencyA}';`)).rejects.toThrow();
  });

  it("stores an explicit Daypart allow-list for a scoped public calendar", async () => {
    await database.exec(`
      UPDATE public_calendar_links SET scope = 'selected' WHERE residency_id = '${ids.residencyA}';
      INSERT INTO public_calendar_link_dayparts (residency_id, daypart_id)
      VALUES ('${ids.residencyA}', '${ids.daypartA}');
    `);
    const result = await database.query<{ scope: string; daypart_id: string }>(`
      SELECT l.scope, d.daypart_id
      FROM public_calendar_links l
      JOIN public_calendar_link_dayparts d ON d.residency_id = l.residency_id
      WHERE l.residency_id = '${ids.residencyA}';
    `);
    expect(result.rows).toEqual([{ scope: "selected", daypart_id: ids.daypartA }]);
    await expect(database.exec(`UPDATE public_calendar_links SET scope = 'private' WHERE residency_id = '${ids.residencyA}';`)).rejects.toThrow();
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

  it("stores one valid date exception per Daypart and rejects malformed overrides", async () => {
    await database.exec(`
      INSERT INTO daypart_date_exceptions (daypart_id, service_date, kind)
      VALUES ('${ids.daypartA}', '2026-09-06', 'skip');
      INSERT INTO daypart_date_exceptions (daypart_id, service_date, kind, start_minute, end_minute)
      VALUES ('${ids.daypartA}', '2026-09-13', 'override', 780, 1020);
    `);
    const exceptions = await database.query<{ service_date: string; kind: string; start_minute: number | null; end_minute: number | null }>(`
      SELECT service_date::text, kind::text, start_minute, end_minute
      FROM daypart_date_exceptions
      WHERE daypart_id = '${ids.daypartA}'
      ORDER BY service_date;
    `);
    expect(exceptions.rows).toEqual([
      { service_date: "2026-09-06", kind: "skip", start_minute: null, end_minute: null },
      { service_date: "2026-09-13", kind: "override", start_minute: 780, end_minute: 1020 },
    ]);
    await expect(database.exec(`
      INSERT INTO daypart_date_exceptions (daypart_id, service_date, kind, start_minute, end_minute)
      VALUES ('${ids.daypartA}', '2026-09-20', 'override', 1200, 900);
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

  it("stores a nonnegative session artist rate on a one-time Shift", async () => {
    await database.exec(`
      UPDATE shifts
      SET client_talent_default_rate_cents = 8500
      WHERE name = 'Movie Night';
    `);
    const result = await database.query<{ client_talent_default_rate_cents: number }>(`
      SELECT client_talent_default_rate_cents
      FROM shifts
      WHERE name = 'Movie Night';
    `);
    expect(result.rows[0].client_talent_default_rate_cents).toBe(8500);

    await expect(database.exec(`
      UPDATE shifts
      SET client_talent_default_rate_cents = -1
      WHERE name = 'Movie Night';
    `)).rejects.toThrow();
  });

  it("stores a one-time House Activity without creating a standing Daypart", async () => {
    await database.exec(`
      INSERT INTO schedule_occurrences
        (residency_id, daypart_id, service_date, name, room, color, type, starts_at, ends_at)
      VALUES
        ('${ids.residencyA}', NULL, '2026-09-12', 'Movie Night', 'Pool', '#7A65D1', 'house_activity', '2026-09-13T01:00:00Z', '2026-09-13T04:00:00Z');
    `);
    const result = await database.query<{ daypart_id: string | null; type: string }>(`
      SELECT daypart_id, type FROM schedule_occurrences WHERE name = 'Movie Night';
    `);
    expect(result.rows[0]).toEqual({ daypart_id: null, type: "house_activity" });
  });

  it("stores Calendar Only Dayparts with suggested hours and rejects incomplete scheduling fields", async () => {
    await database.exec(`
      INSERT INTO dayparts
        (residency_id, name, room, color, type, billing_mode, schedule_mode, suggested_start_minute, suggested_end_minute)
      VALUES
        ('${ids.residencyA}', 'Commune Pool', 'Pool', '#7A65D1', 'house_activity', NULL, 'calendar_only', 720, 1020);
    `);
    const result = await database.query<{ schedule_mode: string; suggested_start_minute: number; suggested_end_minute: number }>(`
      SELECT schedule_mode::text, suggested_start_minute, suggested_end_minute FROM dayparts WHERE name = 'Commune Pool';
    `);
    expect(result.rows[0]).toEqual({ schedule_mode: "calendar_only", suggested_start_minute: 720, suggested_end_minute: 1020 });
    await expect(database.exec(`
      INSERT INTO dayparts
        (residency_id, name, room, color, type, billing_mode, schedule_mode)
      VALUES
        ('${ids.residencyA}', 'Broken On Demand', 'Pool', '#7A65D1', 'house_activity', NULL, 'calendar_only');
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

  it("requires an explicitly assigned active artist for hotel selections", async () => {
    await expect(database.exec(`
      INSERT INTO assignments
        (shift_id, talent_id, source, set_name, starts_at, ends_at, booking_status, compensation_type, talent_rate_cents)
      VALUES
        ('${ids.shiftA}', '${ids.talent}', 'hotel', 'Unapproved', '2026-09-05T20:00:00Z', '2026-09-05T22:00:00Z', 'pending_hfy_confirmation', 'hourly', 8000);
    `)).rejects.toThrow(/explicitly assigned/);
  });

  it("requires an explicitly assigned active artist for internal selections too", async () => {
    await expect(database.exec(`
      INSERT INTO assignments
        (shift_id, talent_id, source, set_name, starts_at, ends_at, booking_status, compensation_type, talent_rate_cents)
      VALUES
        ('${ids.shiftA}', '${ids.talent}', 'internal', 'Unassigned internal', '2026-09-05T20:00:00Z', '2026-09-05T22:00:00Z', 'confirmed', 'hourly', 8000);
    `)).rejects.toThrow(/explicitly assigned/);
  });

  it("keeps HFY booking eligibility independent from client roster visibility", async () => {
    await database.exec(`
      INSERT INTO talent (id, stage_name, roster_status, talent_status)
      VALUES ('${ids.privateEligibleTalent}', 'Private Eligible DJ', 'ready', 'active');
      INSERT INTO residency_talent (residency_id, talent_id, active)
      VALUES ('${ids.residencyA}', '${ids.privateEligibleTalent}', true);
      INSERT INTO shifts
        (id, residency_id, name, service_date, room, starts_at, ends_at, client_rate_cents)
      VALUES
        ('${ids.privateEligibleShift}', '${ids.residencyA}', 'Private HFY Slot', '2026-09-06', 'Pool', '2026-09-06T20:00:00Z', '2026-09-06T23:00:00Z', 10000);
      INSERT INTO assignments
        (shift_id, talent_id, source, set_name, starts_at, ends_at, booking_status, compensation_type, talent_rate_cents)
      VALUES
        ('${ids.privateEligibleShift}', '${ids.privateEligibleTalent}', 'internal', 'Private Eligible DJ', '2026-09-06T20:00:00Z', '2026-09-06T23:00:00Z', 'confirmed', 'hourly', 8000);
    `);
    const before = await database.query<{ active: boolean; client_visible: boolean }>(`
      SELECT active, client_visible FROM residency_talent
      WHERE residency_id = '${ids.residencyA}' AND talent_id = '${ids.privateEligibleTalent}';
    `);
    expect(before.rows[0]).toEqual({ active: true, client_visible: false });
    await database.exec(`
      UPDATE residency_talent SET client_visible = true
      WHERE residency_id = '${ids.residencyA}' AND talent_id = '${ids.privateEligibleTalent}';
    `);
    const after = await database.query<{ active: boolean; client_visible: boolean }>(`
      SELECT active, client_visible FROM residency_talent
      WHERE residency_id = '${ids.residencyA}' AND talent_id = '${ids.privateEligibleTalent}';
    `);
    expect(after.rows[0]).toEqual({ active: true, client_visible: true });
  });

  it("prevents an exclusive artist from being assigned to another Residency roster", async () => {
    await expect(database.exec(`
      INSERT INTO residency_talent (residency_id, talent_id)
      VALUES ('${ids.residencyB}', '${ids.exclusiveTalent}');
    `)).rejects.toThrow(/exclusive Residency/);
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

  it("keeps client-owned rates in their own Residency-only ledger", async () => {
    await database.exec(`
      INSERT INTO talent
        (id, stage_name, ownership, owning_residency_id, exclusive_residency_id, roster_status, talent_status)
      VALUES
        ('${ids.clientOwnedTalent}', 'Client-Owned DJ', 'residency', '${ids.residencyA}', '${ids.residencyA}', 'ready', 'active');
      INSERT INTO residency_talent (residency_id, talent_id)
      VALUES ('${ids.residencyA}', '${ids.clientOwnedTalent}');
      INSERT INTO shifts
        (id, residency_id, name, service_date, room, starts_at, ends_at, economics_mode, client_rate_cents, billing_status)
      VALUES
        ('${ids.clientOwnedShift}', '${ids.residencyA}', 'Client Slot', '2026-09-20', 'Pool', '2026-09-20T20:00:00Z', '2026-09-20T23:00:00Z', 'client_owned', 0, 'not_billable');
      INSERT INTO assignments
        (id, shift_id, talent_id, source, set_name, starts_at, ends_at, booking_status, compensation_type, talent_rate_cents, total_compensation_cents, payout_status)
      VALUES
        ('${ids.clientOwnedAssignment}', '${ids.clientOwnedShift}', '${ids.clientOwnedTalent}', 'client_owned', 'Client-Owned DJ', '2026-09-20T20:00:00Z', '2026-09-20T23:00:00Z', 'confirmed', 'na', 0, 0, 'na');
      INSERT INTO client_assignment_terms (assignment_id, residency_id, rate_cents)
      VALUES ('${ids.clientOwnedAssignment}', '${ids.residencyA}', 12500);
    `);
    const terms = await database.query<{ rate_cents: number }>(`
      SELECT rate_cents FROM client_assignment_terms WHERE assignment_id = '${ids.clientOwnedAssignment}';
    `);
    expect(terms.rows[0]?.rate_cents).toBe(12500);
    await expect(database.exec(`
      UPDATE client_assignment_terms SET residency_id = '${ids.residencyB}'
      WHERE assignment_id = '${ids.clientOwnedAssignment}';
    `)).rejects.toThrow(/match their client-owned Residency slot/);
    await expect(database.exec(`
      UPDATE assignments SET source = 'internal'
      WHERE id = '${ids.clientOwnedAssignment}';
    `)).rejects.toThrow(/matching Assignment source/);
  });

  it("stores Request HFY as a no-artist pending slot", async () => {
    await database.exec(`
      INSERT INTO shifts
        (id, residency_id, name, service_date, room, starts_at, ends_at, economics_mode, client_rate_cents, billing_status)
      VALUES
        ('${ids.hfyRequestShift}', '${ids.residencyA}', 'Request HFY Slot', '2026-09-21', 'Lobby', '2026-09-21T20:00:00Z', '2026-09-21T23:00:00Z', 'hfy_request', 0, 'not_billable');
      INSERT INTO hfy_talent_requests (id, residency_id, shift_id, created_by_user_id)
      VALUES ('${ids.hfyRequest}', '${ids.residencyA}', '${ids.hfyRequestShift}', '${ids.hotel}');
    `);
    const request = await database.query<{ status: string }>(`
      SELECT status FROM hfy_talent_requests WHERE id = '${ids.hfyRequest}';
    `);
    expect(request.rows[0]?.status).toBe("pending");
    await expect(database.exec(`
      INSERT INTO assignments
        (shift_id, talent_id, source, set_name, starts_at, ends_at, booking_status, compensation_type, talent_rate_cents)
      VALUES
        ('${ids.hfyRequestShift}', '${ids.talent}', 'internal', 'Bypass', '2026-09-21T20:00:00Z', '2026-09-21T23:00:00Z', 'confirmed', 'hourly', 8000);
    `)).rejects.toThrow(/matching Assignment source/);
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
