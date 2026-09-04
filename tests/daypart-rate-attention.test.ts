import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { daypartNeedsDefaultArtistRate } from "../src/domain/daypart-rate-attention";

const base = {
  active: true,
  type: "dj_artist" as const,
  billingMode: "tracking_only" as const,
  defaultTalentRateCents: null,
  clientDefaultRateCents: null,
};

describe("Daypart default-rate attention", () => {
  it("flags blank and zero rates for the team responsible for each Talent Activity", () => {
    expect(daypartNeedsDefaultArtistRate(base, "residency")).toBe(true);
    expect(daypartNeedsDefaultArtistRate({ ...base, clientDefaultRateCents: 0 }, "residency")).toBe(true);
    expect(daypartNeedsDefaultArtistRate({ ...base, billingMode: "billed_by_hfy", defaultTalentRateCents: null }, "hfy")).toBe(true);
    expect(daypartNeedsDefaultArtistRate({ ...base, billingMode: "billed_by_hfy", defaultTalentRateCents: 0 }, "hfy")).toBe(true);
  });

  it("clears only after a positive rate and never flags House Activities or inactive Dayparts", () => {
    expect(daypartNeedsDefaultArtistRate({ ...base, clientDefaultRateCents: 1 }, "residency")).toBe(false);
    expect(daypartNeedsDefaultArtistRate({ ...base, billingMode: "billed_by_hfy", defaultTalentRateCents: 8_000 }, "hfy")).toBe(false);
    expect(daypartNeedsDefaultArtistRate({ ...base, type: "house_activity", billingMode: null }, "all")).toBe(false);
    expect(daypartNeedsDefaultArtistRate({ ...base, active: false }, "residency")).toBe(false);
  });

  it("does not expose or assign one team's rate warning to the other team", () => {
    expect(daypartNeedsDefaultArtistRate(base, "hfy")).toBe(false);
    expect(daypartNeedsDefaultArtistRate({ ...base, billingMode: "billed_by_hfy", defaultTalentRateCents: 0 }, "residency")).toBe(false);
    expect(daypartNeedsDefaultArtistRate(base, "all")).toBe(true);
    expect(daypartNeedsDefaultArtistRate({ ...base, billingMode: "billed_by_hfy", defaultTalentRateCents: 0 }, "all")).toBe(true);
  });

  it("keeps attention in the Day Parts surfaces and out of Calendar", async () => {
    const [manager, calendar, residencyShell, ownerShell, auth, internalData, residencyPage, styles] = await Promise.all([
      readFile(new URL("../src/app/app/setup/daypart-manager.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/residency-shell.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/internal-shell.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/lib/auth.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/data/internal.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/dayparts/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/hfy-style-pilot.css", import.meta.url), "utf8"),
    ]);
    expect(manager).toContain("daypart-rate-attention-banner");
    expect(manager).toContain("daypart-rate-needed-mark");
    expect(manager).toContain("daypart-setting-tile rate");
    expect(manager).toContain("formatDraftHourlyRate");
    expect(manager).toContain('draftNeedsRate ? "Required"');
    expect(manager).toContain("calendar-only-daypart-card ${needsRate ? \"needs-rate\"");
    expect(calendar).not.toContain("daypart-rate-attention");
    expect(residencyShell).toContain("attention={needsDaypartRateAttention}");
    expect(ownerShell).toContain('label === "Day Parts"');
    expect(ownerShell).toContain("Object.values(rateAttentionByResidency).some(Boolean)");
    expect(ownerShell).toContain('hasDaypartRateAttention ? "needs-attention"');
    expect(ownerShell).toContain("hasDaypartRateAttention ? <span className=\"residency-nav-attention\">!</span>");
    expect(auth).toContain("coalesce(${dayparts.clientDefaultRateCents}, 0) <= 0");
    expect(auth).toContain("count(${dayparts.id}) > 0");
    expect(internalData).toContain("coalesce(${dayparts.defaultTalentRateCents}, 0) <= 0");
    expect(internalData).toContain("count(${dayparts.id}) > 0");
    expect(internalData).not.toContain("coalesce(${dayparts.clientDefaultRateCents}, 0) <= 0");
    expect(residencyPage).toContain("defaultTalentRateCents: null");
    expect(styles.lastIndexOf(".residency-nav-item.needs-attention")).toBeGreaterThan(styles.lastIndexOf(".owner-workspace-nav .residency-nav-item:is(.active, .active-section)"));
  });
});
