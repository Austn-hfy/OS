import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("one-time calendar slot type", () => {
  it("requires Talent Activity or House Activity before revealing the slot workflow", async () => {
    const calendar = await readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8");

    expect(calendar).toContain('chooseOneTimeType("dj_artist")');
    expect(calendar).toContain('chooseOneTimeType("house_activity")');
    expect(calendar).toContain('addMode === "new-type"');
    expect(calendar).toContain('addMode === "new-repeat"');
    expect(calendar).toContain("Does this repeat?");
    expect(calendar).toContain('className="quick-color-picker"');
    expect(calendar).toContain("Color is assigned automatically from this room.");
    expect(calendar).not.toContain('aria-label="One-time slot color" type="color"');
  });

  it("carries the selected type into persistence and supports standalone House Activities", async () => {
    const [calendar, actions, bookings, migration] = await Promise.all([
      readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/app/actions.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/services/residency-bookings.ts", import.meta.url), "utf8"),
      readFile(new URL("../drizzle/0028_one_time_house_activities.sql", import.meta.url), "utf8"),
    ]);

    expect(calendar).toContain("type: activeSuggestion.oneTime ? activeSuggestion.type : undefined");
    expect(actions).toContain("Choose Talent Activity or House Activity for this one-time slot.");
    expect(bookings).toContain('requested.type === "house_activity"');
    expect(migration).toContain('ALTER COLUMN "daypart_id" DROP NOT NULL');
  });

  it("uses an unambiguous session name and persists an editable one-time artist rate", async () => {
    const [calendar, actions, bookings, schema, migration] = await Promise.all([
      readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/app/actions.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/services/residency-bookings.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/db/schema.ts", import.meta.url), "utf8"),
      readFile(new URL("../drizzle/0034_one_time_session_artist_rate.sql", import.meta.url), "utf8"),
    ]);

    expect(calendar).toContain("Session name");
    expect(calendar).toContain("Poolside Session");
    expect(calendar).not.toContain("Guest DJ Set");
    expect(calendar).toContain("Session artist rate");
    expect(calendar).toContain("clientTalentDefaultRateCents");
    expect(actions).toContain("clientTalentDefaultRateCents");
    expect(bookings).toContain('clientTalentDefaultRateCents: economicsMode === "client_owned"');
    expect(bookings).toContain("tx.update(clientAssignmentTerms)");
    expect(schema).toContain('clientTalentDefaultRateCents: integer("client_talent_default_rate_cents")');
    expect(migration).toContain('ADD COLUMN "client_talent_default_rate_cents" integer');
  });
});
