import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("one-time calendar slot type", () => {
  it("requires Talent Activity or House Activity before revealing the slot workflow", async () => {
    const calendar = await readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8");

    expect(calendar).toContain('chooseOneTimeType("dj_artist")');
    expect(calendar).toContain('chooseOneTimeType("house_activity")');
    expect(calendar).toContain("Choose Talent Activity or House Activity to continue.");
    expect(calendar).toContain("One-time slot color presets");
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
});
