import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

describe("Residency design system V1", () => {
  it("exports the approved primitives and applies them to adopted Residency routes", async () => {
    const [system, account, billing, overview, talent, talentWorkspace, talentCard, tokens, docs] = await Promise.all([
      readSource("../src/components/residency-design-system.tsx"),
      readSource("../src/app/residency/settings/page.tsx"),
      readSource("../src/app/residency/settings/billing/page.tsx"),
      readSource("../src/app/residency/page.tsx"),
      readSource("../src/app/residency/talent/page.tsx"),
      readSource("../src/app/residency/talent/client-artist-lookup.tsx"),
      readSource("../src/app/residency/talent/client-owned-artist-card.tsx"),
      readSource("../src/app/hfy-design-tokens.css"),
      readSource("../docs/DESIGN_SYSTEM_V1.md"),
    ]);

    for (const name of [
      "ResidencyPageSurface",
      "ResidencyPageHeader",
      "ResidencyPageBody",
      "ResidencyTabs",
      "ResidencySurfaceCard",
      "ResidencySectionHeader",
      "ResidencyMetricGrid",
      "ResidencyFactGrid",
      "ResidencyCollectionPanel",
      "ResidencyCollectionToolbar",
      "ResidencyCollectionSearch",
      "ResidencyCollectionFilters",
      "ResidencyCollectionUtility",
      "ResidencyCollectionList",
      "ResidencyCollectionRow",
    ]) {
      expect(system).toContain(name);
    }
    for (const page of [account, billing, overview]) {
      expect(page).toContain("ResidencyPageSurface");
      expect(page).toContain("ResidencyPageBody");
    }
    expect(overview).toContain("ResidencySurfaceCard");
    expect(overview).toContain("ResidencySectionHeader");
    expect(overview).toContain("Open calendar");
    expect(overview).toContain("View plan & invoice history");
    expect(talent).toContain("ResidencyPageSurface");
    for (const name of ["ResidencyPageHeader", "ResidencyPageBody", "ResidencySurfaceCard", "ResidencySectionHeader", "ResidencyCollectionPanel", "ResidencyCollectionRow"]) {
      expect(talentWorkspace).toContain(name);
    }
    expect(talentCard).toContain("ResidencyFactGrid");
    expect(tokens).toContain("--hfy-page-content-inset: 20px;");
    expect(tokens).toContain("--hfy-surface-card-radius: 16px;");
    expect(tokens).toContain("--hfy-collection-panel-scroll-ceiling: 680px;");
    expect(docs).toContain("Version: 1.1");
    expect(docs).toContain("## Compact Collection Panel");
    expect(docs).toContain("Changed this revision:");
  });
});
