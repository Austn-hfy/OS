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
    expect(source).toContain('talent={roster.filter((artist) => artist.ownership === "residency").map');
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

  it("uses title case and one shared type treatment for every Residency navigation item", async () => {
    const [shell, styles] = await Promise.all([
      readFile(new URL("../src/components/residency-shell.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/hfy-style-pilot.css", import.meta.url), "utf8"),
    ]);
    expect(shell).toContain('["Talent", "/residency/talent"]');
    expect(shell).toContain('href="/residency/talent">Artist Lookup</Link>');
    expect(shell).toContain('href="/residency/talent/roster">Roster</Link>');
    expect(shell).not.toContain('["Talent roster", "/residency/talent"]');
    expect(styles).toMatch(/\.hfy-style-system \.nav a,\s*\.hfy-style-system \.client-dayparts-button,/);
  });

  it("uses the same Talent and Payout workspace frames in HFY and Residency modes", async () => {
    const [hfyTalent, clientTalent, hfyPayouts, clientPayouts] = await Promise.all([
      readFile(new URL("../src/app/app/talent/artist-lookup.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/talent/client-artist-lookup.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/app/payouts/payouts-workspace.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/payouts/client-payouts-workspace.tsx", import.meta.url), "utf8"),
    ]);
    expect(hfyTalent).toContain("TalentWorkspaceShell");
    expect(clientTalent).toContain("TalentWorkspaceShell");
    expect(hfyPayouts).toContain("PayoutWorkspaceFrame");
    expect(clientPayouts).toContain("PayoutWorkspaceFrame");
  });
});
