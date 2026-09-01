import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("HFY Programming calendar and Day Parts integration", () => {
  it("filters saved shifts and projected Dayparts to HFY-owned work", async () => {
    const calendar = await readFile(new URL("../src/app/app/calendar/page.tsx", import.meta.url), "utf8");
    const dayparts = await readFile(new URL("../src/app/app/dayparts/page.tsx", import.meta.url), "utf8");

    expect(calendar).toContain("calendar.filter((shift) => isHfyManagedEconomicsMode(shift.economicsMode))");
    expect(calendar).toContain("dayparts.filter(isStandingHfyDaypart)");
    expect(calendar).toContain("projectDaypartSlots(hfyDayparts");
    expect(dayparts).toContain("filter(isStandingHfyDaypart)");
  });

  it("remounts and refetches the interactive calendar when the Residency selector changes", async () => {
    const [page, calendar] = await Promise.all([
      readFile(new URL("../src/app/app/calendar/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8"),
    ]);

    expect(page).toContain("key={selectedResidency.id}");
    expect(page).toContain('residencySelectionParam={workspaceResidency ? "residency" : "calendarResidency"}');
    expect(calendar).toContain('name={residencySelectionParam} defaultValue={residency.id}');
  });

  it("fulfills pending Request HFY records from the calendar through the billing-aware action", async () => {
    const calendar = await readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8");

    expect(calendar).toContain("fulfillHfyTalentRequestAction(initialActionState, formData)");
    expect(calendar).toContain("editingEvent?.hfyRequestId");
    expect(calendar).toContain("Assign & bill");
  });

  it("enforces the default talent-rate guard in every HFY assignment entry point", async () => {
    const [bookings, requests, assignments] = await Promise.all([
      readFile(new URL("../src/services/residency-bookings.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/services/hfy-talent-requests.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/services/assignments.ts", import.meta.url), "utf8"),
    ]);

    expect(bookings.match(/assertResidencyTalentRateConfigured/g)?.length).toBeGreaterThanOrEqual(3);
    expect(requests).toContain("assertResidencyTalentRateConfigured(request.defaultTalentRateCents)");
    expect(assignments.match(/assertResidencyTalentRateConfigured/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
