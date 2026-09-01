import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Company Operations workspace", () => {
  it("exposes company-wide Payouts and an expandable Talent section with Artist Lookup and Roster", async () => {
    const shell = await readFile(new URL("../src/components/internal-shell.tsx", import.meta.url), "utf8");
    expect(shell).toContain('["Payouts", "/app/payouts"]');
    expect(shell).toContain('["Talent", "/app/talent"]');
    expect(shell).toContain('<span>Talent</span>');
    expect(shell).toContain('href="/app/talent">Artist Lookup</Link>');
    expect(shell).toContain('href="/app/talent/roster">Roster</Link>');
    expect(shell).toContain("artistLookupExpanded");
  });

  it("provides a Residency filter on the company-wide Payouts roll-up", async () => {
    const [page, workspace, data] = await Promise.all([
      readFile(new URL("../src/app/app/payouts/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/app/payouts/payouts-workspace.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/data/internal.ts", import.meta.url), "utf8"),
    ]);
    expect(page).toContain("companyWide={!selected}");
    expect(workspace).toContain('id="payout-residency-filter"');
    expect(workspace).toContain('row.residencyId === residencyId');
    expect(data).toContain("residencyId: residencies.id");
  });

  it("keeps the quick Roster focused on scheduling data and explicit placement", async () => {
    const [page, roster] = await Promise.all([
      readFile(new URL("../src/app/app/talent/roster/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/app/talent/roster/company-roster.tsx", import.meta.url), "utf8"),
    ]);
    expect(page).toContain("Shared artists may be assigned to more than one Residency");
    expect(roster).toContain("updateArtistRosterPlacementAction");
    expect(roster).not.toMatch(/payout|w-9|payment|owed/i);
  });

  it("labels eligibility separately from explicit Residency assignments", async () => {
    const lookup = await readFile(new URL("../src/app/app/talent/artist-lookup.tsx", import.meta.url), "utf8");
    expect(lookup).toContain("Residency assignments");
    expect(lookup).toContain("Shared — eligible to be assigned to multiple Residencies.");
    expect(lookup).toContain("Not assigned to a Residency.");
    expect(lookup).not.toContain("Not currently available in any Residency.");
  });
});
