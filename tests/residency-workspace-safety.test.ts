import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Residency workspace boundaries", () => {
  it("scopes Invoice PDF downloads to the signed-in Residency and client-visible statuses", async () => {
    const source = await readFile(new URL("../src/app/residency/invoices/[invoiceId]/pdf/route.ts", import.meta.url), "utf8");
    expect(source).toContain("eq(invoices.residencyId, actor.residencyId)");
    expect(source).toContain('inArray(invoices.status, ["approved", "sent", "paid"])');
    expect(source).not.toContain("talentCost");
    expect(source).not.toContain("grossMargin");
  });

  it("defaults calendars to All Slots without restoring a stale status filter", async () => {
    const source = await readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8");
    expect(source).toContain('useState<StatusFilter>("all")');
    expect(source).not.toContain('getItem("hfy-calendar-status-filter")');
  });

  it("keeps Settings updates tied to the authenticated actor instead of a submitted Residency id", async () => {
    const source = await readFile(new URL("../src/app/residency/actions.ts", import.meta.url), "utf8");
    expect(source).toContain("eq(residencies.id, actor.residencyId)");
    expect(source).not.toContain('formData.get("residencyId")');
  });

  it("keeps the client-safe roster in the shared Residency calendar assignment path", async () => {
    const [source, rosterQuery, ownerPicker, bookingService] = await Promise.all([
      readFile(new URL("../src/app/residency/calendar/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/data/residency-client.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/services/dayparts.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/services/residency-bookings.ts", import.meta.url), "utf8"),
    ]);
    expect(source).toContain("getResidencyClientSafeRoster(actor.residencyId)");
    expect(source).toContain('talent={actor.residencyTier === "complete" ? [] : roster.filter');
    expect(rosterQuery).toContain(".innerJoin(residencyTalent");
    expect(rosterQuery).toContain("eq(residencyTalent.residencyId, residencyId)");
    expect(ownerPicker).toContain(".innerJoin(residencyTalent");
    expect(bookingService.match(/\.innerJoin\(residencyTalent/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps company modes out of Residency workspaces and Dayparts out of Setup", async () => {
    const [shell, residencyShell, setup] = await Promise.all([
      readFile(new URL("../src/components/internal-shell.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/residency-shell.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/app/setup/page.tsx", import.meta.url), "utf8"),
    ]);
    expect(shell).toContain('className="owner-mode-switch"');
    expect(residencyShell).not.toContain("owner-mode-switch");
    expect(setup).not.toContain("DaypartManager");
    expect(setup).not.toContain("standing hours");
  });

  it("uses one primary treatment, the intended order, and a separate Settings zone in Residency navigation", async () => {
    const [shell, styles] = await Promise.all([
      readFile(new URL("../src/components/residency-shell.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/hfy-style-pilot.css", import.meta.url), "utf8"),
    ]);
    const calendar = shell.indexOf('label="Calendar"');
    const dayParts = shell.indexOf('label="Day Parts"');
    const talent = shell.indexOf('label="Talent"');
    const finances = shell.indexOf('label="Finances"');
    const settings = shell.indexOf('label="Settings"');
    expect(calendar).toBeGreaterThan(-1);
    expect(dayParts).toBeGreaterThan(calendar);
    expect(talent).toBeGreaterThan(dayParts);
    expect(finances).toBeGreaterThan(talent);
    expect(settings).toBeGreaterThan(finances);
    expect(shell).toContain("residency-workspace-nav");
    expect(shell).toContain("residency-sidebar-settings");
    expect(shell).toContain('href="/residency/talent" label="Talent"');
    expect(shell).not.toContain('href="/residency/talent/roster"');
    expect(styles).toContain(".residency-workspace-nav .residency-nav-item");
    expect(styles).toContain(".residency-sidebar-settings .residency-nav-item");
    expect(styles).toContain("grid-template-columns: 32px minmax(0, 1fr) auto");
  });

  it("uses one shared compact header on detail workspaces while Calendar and Day Parts keep integrated headings", async () => {
    const [sharedHeader, calendar, dayparts, artistLookup, roster, finances, payouts, invoices, settings] = await Promise.all([
      readFile(new URL("../src/components/residency-page-header.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/calendar/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/dayparts/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/talent/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/talent/roster/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/finances/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/payouts/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/invoices/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/settings/page.tsx", import.meta.url), "utf8"),
    ]);
    expect(sharedHeader).toContain('className="page-header client-page-header residency-page-header"');
    for (const source of [artistLookup, finances, settings]) {
      expect(source).toContain("<ResidencyPageHeader");
    }
    expect(payouts).toContain('redirect("/residency/finances")');
    expect(invoices).toContain('redirect("/residency/finances")');
    expect(roster).toContain('redirect("/residency/talent")');
    expect(calendar).not.toContain("<ResidencyPageHeader");
    expect(dayparts).not.toContain("<ResidencyPageHeader");
  });

  it("consolidates Residency Talent and Finances into single workspace surfaces", async () => {
    const [artistLookup, finances, styles] = await Promise.all([
      readFile(new URL("../src/app/residency/talent/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/finances/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/hfy-style-pilot.css", import.meta.url), "utf8"),
    ]);
    expect(artistLookup).toContain("residency-talent-workspace-surface");
    expect(finances).toContain("workspace-surface-finances");
    expect(finances).toContain("finance-accordions");
    expect(styles).toContain(".residency-workspace-surface");
    expect(styles).toContain(".residency-talent-workspace-surface :is(.artist-roster-panel, .artist-detail-panel)");
    expect(styles).toContain(".finance-accordion");
  });

  it("uses the shared Talent frame while keeping HFY Payouts and client Finances distinct", async () => {
    const [hfyTalent, clientTalent, hfyPayouts, clientFinances] = await Promise.all([
      readFile(new URL("../src/app/app/talent/artist-lookup.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/talent/client-artist-lookup.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/app/payouts/payouts-workspace.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/finances/page.tsx", import.meta.url), "utf8"),
    ]);
    expect(hfyTalent).toContain("TalentWorkspaceShell");
    expect(clientTalent).toContain("TalentWorkspaceShell");
    expect(hfyPayouts).toContain("PayoutWorkspaceFrame");
    expect(clientFinances).not.toContain("PayoutWorkspaceFrame");
    expect(clientFinances).toContain("Owed to Your Talent");
  });
});
