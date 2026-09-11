import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { platformUsageCountsQuery } from "./platform-usage";

const residencyId = "00000000-0000-4000-8000-000000000001";
const periodStart = "2026-09-01";
const periodEnd = "2026-09-30";

let database: PGlite;

async function loadCounts() {
  const result = await drizzle(database).execute(platformUsageCountsQuery(residencyId, periodStart, periodEnd));
  return result.rows[0];
}

beforeAll(async () => {
  database = await PGlite.create();
  await database.exec(`
    CREATE TABLE dayparts (
      id uuid PRIMARY KEY,
      residency_id uuid NOT NULL,
      type text NOT NULL,
      billing_mode text,
      schedule_mode text NOT NULL,
      active boolean NOT NULL DEFAULT true
    );
    CREATE TABLE daypart_day_rules (
      id uuid PRIMARY KEY,
      daypart_id uuid NOT NULL REFERENCES dayparts(id),
      weekday integer NOT NULL
    );
    CREATE TABLE shifts (
      id uuid PRIMARY KEY,
      residency_id uuid NOT NULL,
      daypart_id uuid REFERENCES dayparts(id),
      service_date date NOT NULL,
      client_rate_cents integer NOT NULL DEFAULT 0
    );
    CREATE TABLE schedule_occurrences (
      id uuid PRIMARY KEY,
      residency_id uuid NOT NULL,
      daypart_id uuid REFERENCES dayparts(id),
      service_date date NOT NULL
    );
  `);
});

beforeEach(async () => {
  await database.exec("TRUNCATE schedule_occurrences, shifts, daypart_day_rules, dayparts;");
});

afterAll(async () => {
  await database.close();
});

describe("Business Model v12 platform usage counts", () => {
  it("counts a standing Talent Daypart by actual dates instead of weekly day-rules", async () => {
    await database.exec(`
      INSERT INTO dayparts (id, residency_id, type, billing_mode, schedule_mode)
      VALUES ('00000000-0000-4000-8000-000000000010', '${residencyId}', 'dj_artist', 'tracking_only', 'standing_weekly');
      INSERT INTO daypart_day_rules (id, daypart_id, weekday) VALUES
        ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000010', 1),
        ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000010', 3),
        ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000010', 5);
      INSERT INTO schedule_occurrences (id, residency_id, daypart_id, service_date) VALUES
        ('00000000-0000-4000-8000-000000000014', '${residencyId}', '00000000-0000-4000-8000-000000000010', '2026-09-02'),
        ('00000000-0000-4000-8000-000000000015', '${residencyId}', '00000000-0000-4000-8000-000000000010', '2026-09-09');
    `);

    await expect(loadCounts()).resolves.toMatchObject({ talent_sessions: 2, house_programs: 0 });
  });

  it("counts every actual date of a multi-date one-off Talent Daypart", async () => {
    await database.exec(`
      INSERT INTO dayparts (id, residency_id, type, billing_mode, schedule_mode)
      VALUES ('00000000-0000-4000-8000-000000000020', '${residencyId}', 'dj_artist', 'billed_by_hfy', 'calendar_only');
      INSERT INTO shifts (id, residency_id, daypart_id, service_date) VALUES
        ('00000000-0000-4000-8000-000000000021', '${residencyId}', '00000000-0000-4000-8000-000000000020', '2026-09-19'),
        ('00000000-0000-4000-8000-000000000022', '${residencyId}', '00000000-0000-4000-8000-000000000020', '2026-09-20');
    `);

    await expect(loadCounts()).resolves.toMatchObject({ talent_sessions: 2, house_programs: 0 });
  });

  it("counts a zero-rate Shift under a Tracking-only Talent Daypart", async () => {
    await database.exec(`
      INSERT INTO dayparts (id, residency_id, type, billing_mode, schedule_mode)
      VALUES ('00000000-0000-4000-8000-000000000050', '${residencyId}', 'dj_artist', 'tracking_only', 'calendar_only');
      INSERT INTO shifts (id, residency_id, daypart_id, service_date, client_rate_cents)
      VALUES ('00000000-0000-4000-8000-000000000051', '${residencyId}', '00000000-0000-4000-8000-000000000050', '2026-09-05', 0);
    `);

    await expect(loadCounts()).resolves.toMatchObject({ talent_sessions: 1, house_programs: 0 });
  });

  it("counts the same Talent Daypart date once when both record types exist", async () => {
    await database.exec(`
      INSERT INTO dayparts (id, residency_id, type, billing_mode, schedule_mode)
      VALUES ('00000000-0000-4000-8000-000000000060', '${residencyId}', 'dj_artist', 'tracking_only', 'standing_weekly');
      INSERT INTO shifts (id, residency_id, daypart_id, service_date, client_rate_cents)
      VALUES ('00000000-0000-4000-8000-000000000061', '${residencyId}', '00000000-0000-4000-8000-000000000060', '2026-09-06', 0);
      INSERT INTO schedule_occurrences (id, residency_id, daypart_id, service_date)
      VALUES ('00000000-0000-4000-8000-000000000062', '${residencyId}', '00000000-0000-4000-8000-000000000060', '2026-09-06');
    `);

    await expect(loadCounts()).resolves.toMatchObject({ talent_sessions: 1, house_programs: 0 });
  });

  it("counts a frequent standing House Daypart exactly once", async () => {
    await database.exec(`
      INSERT INTO dayparts (id, residency_id, type, billing_mode, schedule_mode)
      VALUES ('00000000-0000-4000-8000-000000000030', '${residencyId}', 'house_activity', NULL, 'standing_weekly');
      INSERT INTO schedule_occurrences (id, residency_id, daypart_id, service_date) VALUES
        ('00000000-0000-4000-8000-000000000031', '${residencyId}', '00000000-0000-4000-8000-000000000030', '2026-09-01'),
        ('00000000-0000-4000-8000-000000000032', '${residencyId}', '00000000-0000-4000-8000-000000000030', '2026-09-08'),
        ('00000000-0000-4000-8000-000000000033', '${residencyId}', '00000000-0000-4000-8000-000000000030', '2026-09-15'),
        ('00000000-0000-4000-8000-000000000034', '${residencyId}', '00000000-0000-4000-8000-000000000030', '2026-09-22');
    `);

    await expect(loadCounts()).resolves.toMatchObject({ talent_sessions: 0, house_programs: 1 });
  });

  it("counts a multi-date one-off House Daypart exactly once", async () => {
    await database.exec(`
      INSERT INTO dayparts (id, residency_id, type, billing_mode, schedule_mode)
      VALUES ('00000000-0000-4000-8000-000000000040', '${residencyId}', 'house_activity', NULL, 'calendar_only');
      INSERT INTO shifts (id, residency_id, daypart_id, service_date) VALUES
        ('00000000-0000-4000-8000-000000000041', '${residencyId}', '00000000-0000-4000-8000-000000000040', '2026-09-12'),
        ('00000000-0000-4000-8000-000000000042', '${residencyId}', '00000000-0000-4000-8000-000000000040', '2026-09-13');
    `);

    await expect(loadCounts()).resolves.toMatchObject({ talent_sessions: 0, house_programs: 1 });
  });
});
