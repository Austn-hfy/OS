import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Calendar occasional activity follow-up", () => {
  it("lets a manager edit a saved reusable-template occurrence without changing its template", async () => {
    const [calendar, actions, bookings] = await Promise.all([
      readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/app/actions.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/services/residency-bookings.ts", import.meta.url), "utf8"),
    ]);
    expect(calendar).toContain("daypartOccurrenceDraftFromEvent");
    expect(calendar).toContain("Edit this date");
    expect(calendar).toContain("Save date changes");
    expect(calendar).toContain("updateDaypartOccurrenceAction");
    expect(actions).toContain("await updateDaypartOccurrence(actor, parsed)");
    const update = bookings.slice(bookings.indexOf("export async function updateDaypartOccurrence"), bookings.indexOf("export async function deleteOneTimeOccurrence"));
    expect(update).toContain("occurrence.daypartId === null");
    expect(update).toContain("tx.update(scheduleOccurrences).set");
    expect(update).toContain("programDetails:");
    expect(update).not.toContain("tx.update(dayparts)");
  });

  it("uses remove language for reusable templates and does not leave a skip exception behind", async () => {
    const [calendar, actions, daypartService] = await Promise.all([
      readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/app/actions.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/services/dayparts.ts", import.meta.url), "utf8"),
    ]);
    expect(calendar).toContain('editingReusableTemplate ? "Remove from calendar" : "Skip this date"');
    expect(calendar).toContain("The reusable template stays saved in Day Parts.");
    expect(actions).toContain("This date was removed from the Calendar. The reusable template stays saved.");
    const skip = daypartService.slice(daypartService.indexOf("export async function skipDaypartDate"), daypartService.indexOf("export async function clearDaypartDateException"));
    expect(skip).toContain('daypart.scheduleMode === "calendar_only"');
    expect(skip).toContain("tx.delete(daypartDateExceptions)");
    expect(skip).toContain("daypart_calendar_date_removed");
  });

  it("makes the client artist rate non-blocking while preserving the existing Artist Lookup rate stop", async () => {
    const [calendar, bookings, artistLookup] = await Promise.all([
      readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/services/residency-bookings.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/talent/client-artist-lookup.tsx", import.meta.url), "utf8"),
    ]);
    expect(calendar).toContain("Optional while scheduling");
    expect(calendar).toContain("Optional now");
    expect(calendar).not.toContain("oneTimeClientRateMissing");
    expect(bookings).not.toContain("positive session artist rate");
    expect(bookings).toContain("defaultRateCents: rule.clientDefaultRateCents");
    expect(artistLookup).toContain('assignment.defaultRateCents !== null ? "Session default" : "Rate needed"');
    expect(artistLookup).toContain("Enter the hourly rate for this artist and booking.");
  });

  it("puts reusable templates before the weekly grid and explains their names", async () => {
    const manager = await readFile(new URL("../src/app/app/setup/daypart-manager.tsx", import.meta.url), "utf8");
    expect(manager.indexOf("Reusable one-off templates")).toBeLessThan(manager.indexOf("daypart-week-board"));
    expect(manager).toContain("Listed by activity name. Program and host details stay attached only to each scheduled Calendar date.");
    expect(manager).toContain("Reusable");
    expect(manager).toContain("listed above");
  });
});
