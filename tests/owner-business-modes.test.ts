import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Owner Developer and HFY business modes", () => {
  it("keeps Developer focused on Platform support and HFY focused on Programming", async () => {
    const shell = await readFile(new URL("../src/components/internal-shell.tsx", import.meta.url), "utf8");
    expect(shell).toContain('href="/app?mode=developer"><span>Developer</span><small>Platform</small>');
    expect(shell).toContain('href="/app?mode=hfy"><span>HFY</span><small>Programming</small>');
    expect(shell).toContain('mode === "developer" ? [');
    expect(shell).toContain('["Residencies", "/app?mode=developer"]');
    expect(shell).toContain('["Admin Settings", "/app/setup?mode=developer"]');
    expect(shell).toContain('["Work Queue", "/app?mode=hfy"]');
    expect(shell).toContain('["Operations", "/app?mode=hfy&view=operations"]');
    expect(shell).toContain('["Pipeline", "/app/leads?mode=hfy"]');
  });

  it("loads every Residency for Developer without widening normal HFY operational lists", async () => {
    const data = await readFile(new URL("../src/data/internal.ts", import.meta.url), "utf8");
    const developerList = data.slice(data.indexOf("export const getDeveloperResidencyList"), data.indexOf("export async function getBilledByHfyWorkQueue"));
    const operationalList = data.slice(data.indexOf("export const getResidencyList"), data.indexOf("export const getDeveloperResidencyList"));
    expect(developerList).toContain('eq(residencies.operatingMode, "operations")');
    expect(developerList).not.toContain("eq(residencies.active, true)");
    expect(operationalList).toContain("eq(residencies.active, true)");
  });

  it("builds the HFY queue from every Billed-by-HFY Daypart regardless of Residency status", async () => {
    const data = await readFile(new URL("../src/data/internal.ts", import.meta.url), "utf8");
    const queue = data.slice(data.indexOf("export async function getBilledByHfyWorkQueue"), data.indexOf("export type PublicCalendarLinkSettings"));
    expect(queue).toContain('eq(dayparts.billingMode, "billed_by_hfy")');
    expect(queue).toContain('eq(residencies.operatingMode, "operations")');
    expect(queue).not.toContain("eq(residencies.active, true)");
    expect(queue).not.toContain("eq(dayparts.active, true)");
  });

  it("lets an internal owner preview inactive Residency records without changing hotel-user access", async () => {
    const [actions, auth] = await Promise.all([
      readFile(new URL("../src/app/app/view-as-actions.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/lib/auth.ts", import.meta.url), "utf8"),
    ]);
    const enterPreview = actions.slice(actions.indexOf("export async function enterViewAsAction"), actions.indexOf("export async function exitViewAsAction"));
    const internalPreview = auth.slice(auth.indexOf('current.profile.role === "internal_admin"'), auth.indexOf('current.profile.role !== "hotel_user"'));
    const hotelMemberships = auth.slice(auth.indexOf('current.profile.role !== "hotel_user"'), auth.indexOf("export async function requireInternalActor"));
    expect(enterPreview).not.toContain("eq(residencies.active, true)");
    expect(internalPreview).not.toContain("eq(residencies.active, true)");
    expect(hotelMemberships).toContain("eq(residencies.active, true)");
  });

  it("keeps the Developer workspace form mounted until its server action submits", async () => {
    const shell = await readFile(new URL("../src/components/internal-shell.tsx", import.meta.url), "utf8");
    expect(shell).toContain('<form action={enterViewAsAction} key={item.id}>');
    expect(shell).toContain('<button type="submit">');
    expect(shell).not.toContain('<button type="submit" onClick={() => setSwitcherOpen(false)}>');
  });

  it("gives each owner mode a distinct visual system while preserving the global banners", async () => {
    const [styles, rootLayout, residencyShell] = await Promise.all([
      readFile(new URL("../src/app/hfy-style-pilot.css", import.meta.url), "utf8"),
      readFile(new URL("../src/app/layout.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/residency-shell.tsx", import.meta.url), "utf8"),
    ]);
    expect(styles).toContain(".owner-mode-developer");
    expect(styles).toContain(".owner-mode-hfy");
    expect(rootLayout).toContain("environment-banner");
    expect(residencyShell).toContain("view-as-banner");
  });
});
