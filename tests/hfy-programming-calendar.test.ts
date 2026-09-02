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

  it("fulfills pending Request HFY records from Work Queue and Calendar with split shifts and Residency rates", async () => {
    const [calendar, queue, editor, actions, requests] = await Promise.all([
      readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/app/hfy-request-queue.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/app/hfy-request-fulfillment.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/app/actions.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/services/hfy-talent-requests.ts", import.meta.url), "utf8"),
    ]);

    expect(calendar).toContain("<HfyRequestFulfillment");
    expect(queue).toContain("<HfyRequestFulfillment");
    expect(editor).toContain("+ Split with another artist");
    expect(editor).toContain("Cover the full client request");
    expect(editor).not.toMatch(/Client-billed rate|Artist-paid rate/);
    expect(actions).toContain('formData.get("payload")');
    expect(requests).toContain("clientRateCents: request.clientHourlyRateCents");
    expect(requests).toContain("talentRateCents: request.defaultTalentRateCents");
    expect(requests).toContain("createdAssignments");
  });

  it("uses configured colors internally while keeping unscheduled requests pink", async () => {
    const [page, colors] = await Promise.all([
      readFile(new URL("../src/app/app/calendar/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/domain/dayparts.ts", import.meta.url), "utf8"),
    ]);

    expect(page.match(/calendarColorForEconomics\([\s\S]*?"internal"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(colors).toContain('audience: "client" | "internal" = "client"');
    expect(colors).toContain('economicsMode === "hfy_request"');
    expect(colors).toContain("return HFY_PENDING_COLOR;");
  });

  it("links company-calendar events into the selected Residency calendar editor", async () => {
    const [page, calendar, month] = await Promise.all([
      readFile(new URL("../src/app/app/calendar/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/month-calendar.tsx", import.meta.url), "utf8"),
    ]);

    expect(page).toContain("event: shift.id");
    expect(page).toContain("initialEventId={params.event}");
    expect(calendar).toContain("initialEventId?: string");
    expect(month).toContain("event.href");
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
