import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

describe("Full Programming account controls", () => {
  it("removes self-serve artist management in both the page and every mutation", async () => {
    const [page, lookup, actions] = await Promise.all([
      readSource("../src/app/residency/talent/page.tsx"),
      readSource("../src/app/residency/talent/client-artist-lookup.tsx"),
      readSource("../src/app/residency/actions.ts"),
    ]);
    expect(page).toContain('actor.residencyTier === "complete"');
    expect(page).toContain('artist.ownership === "hfy"');
    expect(lookup).toContain("!fullProgramming && creating");
    expect(lookup).toContain("!fullProgramming && artist.outstandingOwedCents");
    expect(actions).toContain("requireSelfServeTalentAccess(actor)");
    expect(actions.match(/requireSelfServeTalentAccess\(actor\)/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it("limits Full Programming Dayparts to House Activity management while retaining one-off scheduling", async () => {
    const manager = await readSource("../src/app/app/setup/daypart-manager.tsx");
    expect(manager).toContain("+ Add House Activity");
    expect(manager).toContain("HFY manages all Talent Activities");
    expect(manager).toContain("Reusable One-off Template");
    expect(manager).toContain('scheduleMode === "calendar_only" ? []');
    expect(manager).toContain('fullProgrammingClient && daypart.type === "dj_artist"');
  });

  it("keeps Talent Activity creation unavailable while preserving the House Activity funnel", async () => {
    const [calendarPage, calendar, service] = await Promise.all([
      readSource("../src/app/residency/calendar/page.tsx"),
      readSource("../src/app/app/calendar/residency-calendar.tsx"),
      readSource("../src/services/residency-bookings.ts"),
    ]);
    expect(calendarPage).toContain('fullProgramming={actor.residencyTier === "complete"}');
    expect(calendarPage).toContain('actor.residencyTier === "complete" ? []');
    expect(calendar).toContain('{!fullProgramming ? <button type="button" onClick={() => chooseOneTimeType("dj_artist")}');
    expect(calendar).toContain("HFY creates and staffs all Talent Activities for Full Programming accounts.");
    expect(calendar).toContain('setAddMode("new-type")');
    expect(calendar).toContain("fullProgramming && previewMode && editingEvent.daypartId");
    expect(calendar).toContain("Save custom hours");
    expect(service).toContain("fullProgrammingAutoRequest");
    expect(service).toContain("requested.assignments.some");
    expect(service).toContain("autoTriggeredByFullProgramming");
    expect(service).toContain('economicsMode === "hfy_request"');
  });

  it("locks monthly talent invoices and carries finalized schedule changes forward", async () => {
    const [actions, shifts, dayparts, requests, template, schema] = await Promise.all([
      readSource("../src/app/app/actions.ts"),
      readSource("../src/services/shifts.ts"),
      readSource("../src/services/dayparts.ts"),
      readSource("../src/services/hfy-talent-requests.ts"),
      readSource("../src/services/invoice-pdf/template.ts"),
      readSource("../src/db/schema.ts"),
    ]);
    expect(actions).toContain("isFullCalendarMonth");
    expect(actions).toContain("talentScheduleLocks");
    expect(actions).toContain('status: "applied"');
    expect(schema).toContain('pgTable("talent_schedule_locks"');
    expect(schema).toContain('pgTable("talent_invoice_adjustments"');
    for (const source of [shifts, dayparts, requests]) expect(source).toContain("talentInvoiceAdjustments");
    expect(template).toContain("HFY Talent Invoice");
  });
});
