import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";
import type { ResidencyActor } from "@/lib/auth";

const mockedDatabase = vi.hoisted(() => ({ value: undefined as unknown }));

vi.mock("@/db/client", () => ({ getDb: () => mockedDatabase.value }));

import { getResidencyClientTalentLedger } from "@/data/residency-client";
import { rescheduleAssignment } from "@/services/assignments";
import { createResidencyDateBooking } from "@/services/residency-bookings";

const residencyId = "00000000-0000-4000-8000-000000000101";
const daypartId = "00000000-0000-4000-8000-000000000110";
const artistOneId = "00000000-0000-4000-8000-000000000130";
const artistTwoId = "00000000-0000-4000-8000-000000000131";
const actor: ResidencyActor = {
  kind: "residency",
  userId: "00000000-0000-4000-8000-000000000140",
  email: "manager@example.com",
  displayName: "Manager",
  residencyId,
  residencyName: "Test Residency",
  residencyTimezone: "America/Los_Angeles",
  residencyTier: "operations_only",
  accessRole: "manager",
  isViewAs: false,
  isInternalTest: true,
  availableResidencies: [],
};

let database: PGlite;

beforeAll(async () => {
  database = await PGlite.create();
  mockedDatabase.value = drizzle(database, { schema });
  await database.exec(`
    CREATE TABLE residencies (
      id uuid PRIMARY KEY,
      tier text NOT NULL,
      timezone text NOT NULL,
      client_hourly_rate_cents integer NOT NULL DEFAULT 0,
      default_talent_rate_cents integer,
      active boolean NOT NULL,
      operating_mode text NOT NULL
    );
    CREATE TABLE dayparts (
      id uuid PRIMARY KEY,
      residency_id uuid NOT NULL,
      room_id uuid,
      name text NOT NULL,
      room text NOT NULL,
      color text NOT NULL,
      type text NOT NULL,
      billing_mode text,
      schedule_mode text NOT NULL,
      active boolean NOT NULL,
      active_until date,
      default_talent_rate_cents integer,
      client_default_rate_cents integer,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE daypart_day_rules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      daypart_id uuid NOT NULL,
      weekday integer NOT NULL,
      start_minute integer NOT NULL,
      end_minute integer NOT NULL,
      default_dj_count integer
    );
    CREATE TABLE daypart_date_exceptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      daypart_id uuid NOT NULL,
      service_date date NOT NULL,
      kind text NOT NULL,
      start_minute integer,
      end_minute integer
    );
    CREATE TABLE talent (
      id uuid PRIMARY KEY,
      stage_name text NOT NULL,
      ownership text NOT NULL,
      owning_residency_id uuid,
      exclusive_residency_id uuid,
      talent_status text NOT NULL,
      archived_at timestamptz
    );
    CREATE TABLE residency_talent (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      residency_id uuid NOT NULL,
      talent_id uuid NOT NULL,
      active boolean NOT NULL,
      client_visible boolean NOT NULL
    );
    CREATE TABLE schedule_occurrences (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      residency_id uuid NOT NULL,
      daypart_id uuid,
      service_date date NOT NULL
    );
    CREATE TABLE schedule_occurrence_talent (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      occurrence_id uuid NOT NULL,
      talent_id uuid NOT NULL,
      starts_at timestamptz NOT NULL,
      ends_at timestamptz NOT NULL
    );
    CREATE TABLE shifts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      residency_id uuid NOT NULL,
      room_id uuid,
      daypart_id uuid,
      invoice_id uuid,
      name text NOT NULL,
      service_date date NOT NULL,
      room text NOT NULL,
      calendar_color text,
      starts_at timestamptz NOT NULL,
      ends_at timestamptz NOT NULL,
      notes text NOT NULL DEFAULT '',
      program_details text NOT NULL DEFAULT '',
      manual_host_name text NOT NULL DEFAULT '',
      economics_mode text NOT NULL,
      client_talent_default_rate_cents integer,
      client_rate_override_cents integer,
      client_rate_cents integer NOT NULL,
      billing_status text NOT NULL,
      invoice_link_issue boolean NOT NULL,
      invoice_link_note text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE assignments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      shift_id uuid NOT NULL,
      talent_id uuid,
      created_by_user_id uuid,
      source text NOT NULL,
      set_name text NOT NULL,
      guest_name text NOT NULL DEFAULT '',
      role text NOT NULL DEFAULT 'DJ',
      starts_at timestamptz NOT NULL,
      ends_at timestamptz NOT NULL,
      booking_status text NOT NULL,
      compensation_type text NOT NULL,
      talent_rate_override_cents integer,
      talent_rate_cents integer NOT NULL,
      fixed_fee_cents integer,
      total_compensation_cents integer NOT NULL,
      payout_status text NOT NULL,
      paid_at timestamptz,
      paid_amount_cents integer,
      payment_reference text,
      internal_notes text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE client_assignment_terms (
      assignment_id uuid PRIMARY KEY,
      residency_id uuid NOT NULL,
      default_rate_cents integer,
      rate_cents integer,
      updated_by_user_id uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE audit_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      residency_id uuid,
      actor_user_id uuid,
      actor_label text NOT NULL,
      action text NOT NULL,
      entity_type text NOT NULL,
      entity_id uuid NOT NULL,
      details jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
});

beforeEach(async () => {
  await database.exec(`
    TRUNCATE audit_log, client_assignment_terms, assignments, shifts, schedule_occurrence_talent,
      schedule_occurrences, residency_talent, talent, daypart_date_exceptions, daypart_day_rules, dayparts, residencies;
    INSERT INTO residencies
      (id, tier, timezone, client_hourly_rate_cents, default_talent_rate_cents, active, operating_mode)
    VALUES ('${residencyId}', 'operations_only', 'America/Los_Angeles', 0, NULL, true, 'operations');
    INSERT INTO dayparts
      (id, residency_id, name, room, color, type, billing_mode, schedule_mode, active, client_default_rate_cents)
    VALUES ('${daypartId}', '${residencyId}', 'Late Night DJs', 'Amigo Room', '#2783DC',
      'dj_artist', 'tracking_only', 'standing_weekly', true, 6000);
    INSERT INTO daypart_day_rules (daypart_id, weekday, start_minute, end_minute) VALUES
      ('${daypartId}', 5, 1260, 1440),
      ('${daypartId}', 6, 1260, 1440);
    INSERT INTO talent
      (id, stage_name, ownership, owning_residency_id, exclusive_residency_id, talent_status) VALUES
      ('${artistOneId}', 'Artist 1', 'residency', '${residencyId}', '${residencyId}', 'active'),
      ('${artistTwoId}', 'Artist 2', 'residency', '${residencyId}', '${residencyId}', 'active');
    INSERT INTO residency_talent (residency_id, talent_id, active, client_visible) VALUES
      ('${residencyId}', '${artistOneId}', true, true),
      ('${residencyId}', '${artistTwoId}', true, true);
  `);
});

afterAll(async () => {
  mockedDatabase.value = undefined;
  await database.close();
});

function bookingFor(serviceDate: string, talentId: string) {
  return createResidencyDateBooking(actor, {
    residencyId,
    serviceDate,
    dayparts: [{
      daypartId,
      startMinute: 1260,
      endMinute: 1440,
      assignments: [{
        talentId,
        startsAtMinute: 1260,
        endsAtMinute: 1440,
        compensationType: "hourly",
        talentRateOverrideCents: 9999,
        fixedFeeCents: 99999,
      }],
    }],
  });
}

describe("Client Managed Talent bookings", () => {
  it("creates distinct Finance-visible owed records for projected Friday and Saturday dates", async () => {
    const friday = await bookingFor("2026-09-11", artistOneId);
    const saturday = await bookingFor("2026-09-12", artistTwoId);

    expect(friday).toMatchObject({ occurrenceIds: [] });
    expect(saturday).toMatchObject({ occurrenceIds: [] });
    expect(friday.shiftIds).toHaveLength(1);
    expect(saturday.shiftIds).toHaveLength(1);
    expect(friday.shiftIds[0]).not.toBe(saturday.shiftIds[0]);

    const ledger = await getResidencyClientTalentLedger(residencyId);
    expect(ledger.map((row) => ({
      id: row.id,
      artist: row.artist,
      serviceDate: row.serviceDate,
      effectiveRateCents: row.effectiveRateCents,
      owedCents: row.owedCents,
    }))).toEqual([
      expect.objectContaining({ artist: "Artist 1", serviceDate: "2026-09-11", effectiveRateCents: 6000, owedCents: 18000 }),
      expect.objectContaining({ artist: "Artist 2", serviceDate: "2026-09-12", effectiveRateCents: 6000, owedCents: 18000 }),
    ]);
    expect(ledger[0].id).not.toBe(ledger[1].id);

    await expect(database.query("SELECT COUNT(*)::int AS count FROM schedule_occurrences"))
      .resolves.toMatchObject({ rows: [{ count: 0 }] });
    await expect(database.query("SELECT COUNT(*)::int AS count FROM schedule_occurrence_talent"))
      .resolves.toMatchObject({ rows: [{ count: 0 }] });
    await expect(database.query("SELECT COUNT(*)::int AS count FROM client_assignment_terms"))
      .resolves.toMatchObject({ rows: [{ count: 2 }] });
  });

  it("changes only one booked artist's owed amount when their own hours are edited", async () => {
    await bookingFor("2026-09-11", artistOneId);
    await bookingFor("2026-09-12", artistTwoId);
    const before = await getResidencyClientTalentLedger(residencyId);
    const friday = before.find((row) => row.serviceDate === "2026-09-11")!;

    await rescheduleAssignment(actor, friday.id, {
      talentId: artistOneId,
      startsAtMinute: 1320,
      endsAtMinute: 1440,
    });

    const after = await getResidencyClientTalentLedger(residencyId);
    expect(after.map((row) => ({ serviceDate: row.serviceDate, artist: row.artist, owedCents: row.owedCents }))).toEqual([
      { serviceDate: "2026-09-11", artist: "Artist 1", owedCents: 12000 },
      { serviceDate: "2026-09-12", artist: "Artist 2", owedCents: 18000 },
    ]);
    await expect(database.query(`
      SELECT weekday, start_minute, end_minute
      FROM daypart_day_rules
      WHERE daypart_id = '${daypartId}'
      ORDER BY weekday;
    `)).resolves.toMatchObject({ rows: [
      { weekday: 5, start_minute: 1260, end_minute: 1440 },
      { weekday: 6, start_minute: 1260, end_minute: 1440 },
    ] });
    await expect(database.query(`
      SELECT service_date::text, EXTRACT(HOUR FROM ends_at - starts_at)::int AS hours
      FROM shifts
      ORDER BY service_date;
    `)).resolves.toMatchObject({ rows: [
      { service_date: "2026-09-11", hours: 3 },
      { service_date: "2026-09-12", hours: 3 },
    ] });
  });
});
