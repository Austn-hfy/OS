import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Company Operations workspace", () => {
  it("exposes company-wide Payouts and one direct Talent destination", async () => {
    const shell = await readFile(new URL("../src/components/internal-shell.tsx", import.meta.url), "utf8");
    expect(shell).toContain('{ label: "Payouts", href: "/app/payouts?mode=hfy"');
    expect(shell).toContain('{ label: "Talent", href: "/app/talent?mode=hfy"');
    expect(shell).not.toContain('href="/app/talent/roster?mode=hfy"');
    expect(shell).not.toContain("talentExpanded");
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

  it("redirects the retired Roster page to Talent while Artist Lookup keeps placement controls", async () => {
    const [page, lookup] = await Promise.all([
      readFile(new URL("../src/app/app/talent/roster/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/app/talent/artist-lookup.tsx", import.meta.url), "utf8"),
    ]);
    expect(page).toContain('redirect("/app/talent?mode=hfy")');
    expect(lookup).toContain("updateArtistResidenciesAction");
    expect(lookup).toContain("Add to Residency");
  });

  it("labels eligibility separately from explicit Residency assignments", async () => {
    const lookup = await readFile(new URL("../src/app/app/talent/artist-lookup.tsx", import.meta.url), "utf8");
    expect(lookup).toContain("Residency assignments");
    expect(lookup).toContain("Shared — eligible to be assigned to multiple Residencies.");
    expect(lookup).toContain("Not assigned to a Residency.");
    expect(lookup).not.toContain("Not currently available in any Residency.");
  });
});
