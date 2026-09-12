import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";
import type { ResidencyActor } from "@/lib/auth";

const mockedDatabase = vi.hoisted(() => ({ value: undefined as unknown }));

vi.mock("@/db/client", () => ({ getDb: () => mockedDatabase.value }));

import { addClientManagedAssignmentToScheduleOccurrence, requestHfyForScheduleOccurrence } from "./residency-bookings";

const residencyId = "00000000-0000-4000-8000-000000000001";
const talentDaypartId = "00000000-0000-4000-8000-000000000010";
const houseDaypartId = "00000000-0000-4000-8000-000000000011";
const talentOccurrenceId = "00000000-0000-4000-8000-000000000020";
const houseOccurrenceId = "00000000-0000-4000-8000-000000000021";
const talentId = "00000000-0000-4000-8000-000000000030";
const actor: ResidencyActor = {
  kind: "residency",
  userId: "00000000-0000-4000-8000-000000000040",
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
      timezone text NOT NULL,
      tier text NOT NULL,
      active boolean NOT NULL,
      operating_mode text NOT NULL
    );
    CREATE TABLE dayparts (
      id uuid PRIMARY KEY,
      residency_id uuid NOT NULL,
      type text NOT NULL,
      billing_mode text,
      client_default_rate_cents integer
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
      id uuid PRIMARY KEY,
      residency_id uuid NOT NULL,
      room_id uuid,
      daypart_id uuid,
      service_date date NOT NULL,
      name text NOT NULL,
      room text NOT NULL,
      color text NOT NULL,
      type text NOT NULL,
      notes text NOT NULL DEFAULT '',
      program_details text NOT NULL DEFAULT '',
      manual_host_name text NOT NULL DEFAULT '',
      starts_at timestamptz NOT NULL,
      ends_at timestamptz NOT NULL,
      created_by_user_id uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE schedule_occurrence_talent (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      occurrence_id uuid NOT NULL,
      talent_id uuid NOT NULL,
      starts_at timestamptz NOT NULL,
      ends_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
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
    CREATE TABLE hfy_talent_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      residency_id uuid NOT NULL,
      shift_id uuid NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      fulfilled_assignment_id uuid,
      created_by_user_id uuid,
      fulfilled_by_user_id uuid,
      fulfilled_at timestamptz,
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
    TRUNCATE audit_log, hfy_talent_requests, client_assignment_terms, assignments, shifts, schedule_occurrence_talent,
      schedule_occurrences, residency_talent, talent, dayparts, residencies;
    INSERT INTO residencies (id, timezone, tier, active, operating_mode)
    VALUES ('${residencyId}', 'America/Los_Angeles', 'operations_only', true, 'operations');
    INSERT INTO dayparts (id, residency_id, type, billing_mode, client_default_rate_cents) VALUES
      ('${talentDaypartId}', '${residencyId}', 'dj_artist', 'tracking_only', 6000),
      ('${houseDaypartId}', '${residencyId}', 'house_activity', NULL, NULL);
    INSERT INTO talent (id, stage_name, ownership, owning_residency_id, exclusive_residency_id, talent_status)
    VALUES ('${talentId}', 'Registered Artist', 'residency', '${residencyId}', '${residencyId}', 'active');
    INSERT INTO residency_talent (residency_id, talent_id, active, client_visible)
    VALUES ('${residencyId}', '${talentId}', true, true);
    INSERT INTO schedule_occurrences
      (id, residency_id, daypart_id, service_date, name, room, color, type, starts_at, ends_at)
    VALUES
      ('${talentOccurrenceId}', '${residencyId}', '${talentDaypartId}', '2026-09-11', 'Pool DJ', 'Pool', '#2783DC', 'dj_artist', '2026-09-11T19:00:00Z', '2026-09-12T02:00:00Z'),
      ('${houseOccurrenceId}', '${residencyId}', '${houseDaypartId}', '2026-09-11', 'Pool Movie', 'Pool', '#248F94', 'house_activity', '2026-09-12T03:00:00Z', '2026-09-12T05:00:00Z');
  `);
});

afterAll(async () => {
  mockedDatabase.value = undefined;
  await database.close();
});

describe("materialized Tracking-only occurrence staffing", () => {
  it("converts a Talent occurrence into a client-owned Shift and real Assignment", async () => {
    await addClientManagedAssignmentToScheduleOccurrence(actor, {
      occurrenceId: talentOccurrenceId,
      talentId,
      startsAtMinute: 720,
      endsAtMinute: 1140,
      compensationType: "hourly",
      talentRateOverrideCents: 7500,
      fixedFeeCents: 50000,
    });

    await expect(database.query(`SELECT 1 FROM schedule_occurrences WHERE id = '${talentOccurrenceId}'`))
      .resolves.toMatchObject({ rows: [] });
    await expect(database.query("SELECT 1 FROM schedule_occurrence_talent")).resolves.toMatchObject({ rows: [] });
    await expect(database.query("SELECT economics_mode, client_talent_default_rate_cents FROM shifts"))
      .resolves.toMatchObject({ rows: [{ economics_mode: "client_owned", client_talent_default_rate_cents: 6000 }] });
    await expect(database.query("SELECT source, compensation_type, talent_rate_cents, total_compensation_cents, payout_status FROM assignments"))
      .resolves.toMatchObject({ rows: [{ source: "client_owned", compensation_type: "na", talent_rate_cents: 0, total_compensation_cents: 0, payout_status: "na" }] });
    await expect(database.query("SELECT residency_id::text, default_rate_cents, rate_cents FROM client_assignment_terms"))
      .resolves.toMatchObject({ rows: [{ residency_id: residencyId, default_rate_cents: 6000, rate_cents: null }] });
  });

  it("does not allow House occurrences into the artist-linking path", async () => {
    await expect(addClientManagedAssignmentToScheduleOccurrence(actor, {
      occurrenceId: houseOccurrenceId,
      talentId,
      startsAtMinute: 1200,
      endsAtMinute: 1320,
      compensationType: "hourly",
      talentRateOverrideCents: null,
      fixedFeeCents: null,
    })).rejects.toThrow(/Client Managed Talent occurrence/);

    await expect(database.query("SELECT 1 FROM schedule_occurrence_talent")).resolves.toMatchObject({ rows: [] });
    await expect(database.query(`SELECT 1 FROM schedule_occurrences WHERE id = '${houseOccurrenceId}'`))
      .resolves.toMatchObject({ rows: [{}] });
  });

  it("converts the empty occurrence into a pending Shift only when Request HFY is chosen", async () => {
    await requestHfyForScheduleOccurrence(actor, talentOccurrenceId);

    await expect(database.query(`SELECT 1 FROM schedule_occurrences WHERE id = '${talentOccurrenceId}'`))
      .resolves.toMatchObject({ rows: [] });
    await expect(database.query("SELECT economics_mode FROM shifts"))
      .resolves.toMatchObject({ rows: [{ economics_mode: "hfy_request" }] });
    await expect(database.query("SELECT 1 FROM hfy_talent_requests WHERE status = 'pending'"))
      .resolves.toMatchObject({ rows: [{}] });
    await expect(database.query("SELECT 1 FROM assignments")).resolves.toMatchObject({ rows: [] });
  });
});
