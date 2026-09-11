import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFile } from "node:fs/promises";
import * as schema from "@/db/schema";

const mockedDatabase = vi.hoisted(() => ({ value: undefined as unknown }));

vi.mock("@/db/client", () => ({ getDb: () => mockedDatabase.value }));

import {
  materializeStandingDaypartRange,
  runStandingDaypartMaterialization,
  standingDaypartMaterializationWindow,
} from "./daypart-materialization";

const residencyId = "00000000-0000-4000-8000-000000000001";
const billedDaypartId = "00000000-0000-4000-8000-000000000011";
const trackingDaypartId = "00000000-0000-4000-8000-000000000012";
const houseDaypartId = "00000000-0000-4000-8000-000000000013";
const calendarComparisonDaypartId = "00000000-0000-4000-8000-000000000014";
const actor = { userId: null, label: "test-materializer" };

let database: PGlite;

beforeAll(async () => {
  database = await PGlite.create();
  mockedDatabase.value = drizzle(database, { schema });
  await database.exec(`
    CREATE TABLE residencies (
      id uuid PRIMARY KEY,
      timezone text NOT NULL,
      tier text NOT NULL,
      client_hourly_rate_cents integer NOT NULL,
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
      suggested_start_minute integer,
      suggested_end_minute integer,
      default_talent_rate_cents integer,
      client_default_rate_cents integer,
      active_until date,
      active boolean NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE daypart_day_rules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      daypart_id uuid NOT NULL,
      weekday integer NOT NULL,
      start_minute integer NOT NULL,
      end_minute integer NOT NULL,
      default_dj_count integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE daypart_date_exceptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      daypart_id uuid NOT NULL,
      service_date date NOT NULL,
      kind text NOT NULL,
      start_minute integer,
      end_minute integer,
      created_by_user_id uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (daypart_id, service_date)
    );
    CREATE TABLE invoices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      residency_id uuid NOT NULL,
      kind text NOT NULL,
      status text NOT NULL,
      billing_period_start date NOT NULL,
      billing_period_end date NOT NULL
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
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (daypart_id, service_date),
      UNIQUE (residency_id, room, starts_at, ends_at)
    );
    CREATE TABLE schedule_occurrences (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (daypart_id, service_date)
    );
    CREATE TABLE talent_invoice_adjustments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      residency_id uuid NOT NULL,
      source_invoice_id uuid NOT NULL,
      source_shift_id uuid,
      service_date date NOT NULL,
      reason text NOT NULL,
      description text NOT NULL,
      amount_cents integer NOT NULL,
      created_by_user_id uuid
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
    TRUNCATE audit_log, talent_invoice_adjustments, schedule_occurrences, shifts,
      invoices, daypart_date_exceptions, daypart_day_rules, dayparts, residencies;
    INSERT INTO residencies
      (id, timezone, tier, client_hourly_rate_cents, active, operating_mode)
    VALUES
      ('${residencyId}', 'America/Los_Angeles', 'operations_only', 13500, true, 'operations');
    INSERT INTO dayparts
      (id, residency_id, name, room, color, type, billing_mode, schedule_mode, active)
    VALUES
      ('${billedDaypartId}', '${residencyId}', 'Billed DJ', 'Pool', '#2783DC', 'dj_artist', 'billed_by_hfy', 'standing_weekly', true),
      ('${trackingDaypartId}', '${residencyId}', 'Tracked DJ', 'Lobby', '#7A65D1', 'dj_artist', 'tracking_only', 'standing_weekly', true),
      ('${houseDaypartId}', '${residencyId}', 'Movie Night', 'Clubhouse', '#248F94', 'house_activity', NULL, 'standing_weekly', true),
      ('${calendarComparisonDaypartId}', '${residencyId}', 'Second Movie Night', 'Terrace', '#E98332', 'house_activity', NULL, 'standing_weekly', true);
    INSERT INTO daypart_day_rules (daypart_id, weekday, start_minute, end_minute) VALUES
      ('${billedDaypartId}', 5, 1200, 1380),
      ('${trackingDaypartId}', 5, 1080, 1200),
      ('${houseDaypartId}', 5, 1080, 1200),
      ('${calendarComparisonDaypartId}', 5, 1080, 1200);
  `);
});

afterAll(async () => {
  mockedDatabase.value = undefined;
  await database.close();
});

describe("standing Daypart materialization", () => {
  it("automatically creates the dated Shift for a Billed-by-HFY standing Daypart", async () => {
    await runStandingDaypartMaterialization(new Date("2026-09-10T19:00:00.000Z"));

    const result = await database.query<{ service_date: string; economics_mode: string }>(`
      SELECT service_date::text, economics_mode
      FROM shifts
      WHERE daypart_id = '${billedDaypartId}'
      ORDER BY service_date
      LIMIT 1;
    `);
    expect(result.rows[0]).toEqual({ service_date: "2026-09-11", economics_mode: "hfy" });
    const occurrences = await database.query<{ daypart_id: string; type: string }>(`
      SELECT daypart_id::text, type
      FROM schedule_occurrences
      WHERE service_date = '2026-09-11'
      ORDER BY daypart_id;
    `);
    expect(occurrences.rows).toEqual([
      { daypart_id: trackingDaypartId, type: "dj_artist" },
      { daypart_id: houseDaypartId, type: "house_activity" },
      { daypart_id: calendarComparisonDaypartId, type: "house_activity" },
    ]);
  });

  it("does not create a dated record when the standing date has an active skip", async () => {
    await database.exec(`
      INSERT INTO daypart_date_exceptions (daypart_id, service_date, kind)
      VALUES ('${trackingDaypartId}', '2026-09-11', 'skip');
    `);
    const result = await materializeStandingDaypartRange({
      residencyId,
      rangeStart: "2026-09-11",
      rangeEnd: "2026-09-11",
      daypartIds: [trackingDaypartId],
      actor,
      source: "daypart_save",
    });

    expect(result.created).toEqual([]);
    expect((await database.query("SELECT 1 FROM schedule_occurrences")).rows).toEqual([]);
  });

  it("uses custom exception hours on the materialized record", async () => {
    await database.exec(`
      INSERT INTO daypart_date_exceptions (daypart_id, service_date, kind, start_minute, end_minute)
      VALUES ('${houseDaypartId}', '2026-09-11', 'override', 1140, 1260);
    `);
    await materializeStandingDaypartRange({
      residencyId,
      rangeStart: "2026-09-11",
      rangeEnd: "2026-09-11",
      daypartIds: [houseDaypartId],
      actor,
      source: "daypart_save",
    });

    const result = await database.query<{ starts_at: Date; ends_at: Date }>(`
      SELECT starts_at, ends_at FROM schedule_occurrences
      WHERE daypart_id = '${houseDaypartId}';
    `);
    expect(new Date(result.rows[0].starts_at).toISOString()).toBe("2026-09-12T02:00:00.000Z");
    expect(new Date(result.rows[0].ends_at).toISOString()).toBe("2026-09-12T04:00:00.000Z");
  });

  it("uses the same record builder for calendar-click and Daypart-creation sources", async () => {
    const daypartCreated = await materializeStandingDaypartRange({
      residencyId,
      rangeStart: "2026-09-11",
      rangeEnd: "2026-09-11",
      daypartIds: [houseDaypartId],
      actor,
      source: "daypart_save",
    });
    const calendarClicked = await materializeStandingDaypartRange({
      residencyId,
      rangeStart: "2026-09-11",
      rangeEnd: "2026-09-11",
      daypartIds: [calendarComparisonDaypartId],
      actor,
      source: "calendar_click",
    });

    expect(daypartCreated.created[0].recordKind).toBe("tracking_occurrence");
    expect(calendarClicked.created[0].recordKind).toBe("tracking_occurrence");
    expect(daypartCreated.created[0].startsAt).toEqual(calendarClicked.created[0].startsAt);
    expect(daypartCreated.created[0].endsAt).toEqual(calendarClicked.created[0].endsAt);
    const actions = await database.query<{ action: string }>(`
      SELECT action FROM audit_log ORDER BY created_at, id;
    `);
    expect(actions.rows.map((row) => row.action)).toEqual([
      "standing_daypart_record_materialized",
      "standing_daypart_record_materialized",
    ]);

    const [calendarService, daypartService] = await Promise.all([
      readFile(new URL("./residency-bookings.ts", import.meta.url), "utf8"),
      readFile(new URL("./dayparts.ts", import.meta.url), "utf8"),
    ]);
    expect(calendarService).toContain("materializeStandingDaypartDateInTransaction(tx");
    expect(daypartService).toContain("materializeStandingDaypartRollingWindowInTransaction(tx");
  });

  it("keeps the unattended window future-only and bounded to 90 days", () => {
    expect(standingDaypartMaterializationWindow(
      new Date("2026-09-10T19:00:00.000Z"),
      "America/Los_Angeles",
    )).toEqual({ rangeStart: "2026-09-11", rangeEnd: "2026-12-09" });
  });
});
