import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

describe("Residency Talent responsive layout", () => {
  it("keeps the shared V1 hierarchy around the Talent-specific workspace", async () => {
    const [page, workspace, artistCard] = await Promise.all([
      readSource("../src/app/residency/talent/page.tsx"),
      readSource("../src/app/residency/talent/client-artist-lookup.tsx"),
      readSource("../src/app/residency/talent/client-owned-artist-card.tsx"),
    ]);

    expect(page).toContain("ResidencyPageSurface");
    expect(page).not.toContain("WorkspaceSurface");
    expect(workspace).toContain("ResidencyPageHeader");
    expect(workspace).toContain("ResidencyPageBody");
    expect(workspace.match(/ResidencySurfaceCard/g)?.length).toBeGreaterThanOrEqual(3);
    expect(workspace).toContain("ResidencySectionHeader");
    expect(artistCard).toContain("ResidencyFactGrid");
  });

  it("uses one declared split-to-stack transition and protects the detail width", async () => {
    const styles = await readSource("../src/app/hfy-style-pilot.css");
    const talentStyles = styles.slice(styles.indexOf("/* Residency Talent uses the V1 surface hierarchy"));

    expect(talentStyles).toContain("container-name: residency-talent-workspace");
    expect(talentStyles).toContain("grid-template-columns: minmax(280px, .68fr) minmax(520px, 1.32fr)");
    expect(talentStyles).toContain("@container residency-talent-workspace (max-width: 940px)");
    expect(talentStyles).toMatch(/@container residency-talent-workspace \(max-width: 940px\)[\s\S]*?grid-template-columns: 1fr;/);
  });

  it("keeps roster filters proportional and isolates active-artist edit mode", async () => {
    const [workspace, artistCard, styles] = await Promise.all([
      readSource("../src/app/residency/talent/client-artist-lookup.tsx"),
      readSource("../src/app/residency/talent/client-owned-artist-card.tsx"),
      readSource("../src/app/hfy-style-pilot.css"),
    ]);
    const talentStyles = styles.slice(styles.indexOf("/* Residency Talent uses the V1 surface hierarchy"));

    expect(workspace).toContain('className="artist-roster-tabs residency-talent-filter-tabs"');
    expect(workspace).toContain("data-tab-count={tabs.length}");
    expect(talentStyles).toMatch(/\.residency-talent-filter-tabs > div \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
    expect(talentStyles).toMatch(/\.residency-talent-filter-tabs\[data-tab-count="1"\] > div \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/);
    expect(workspace).toContain("!selected.archivedAt && !selectedIsEditing");
    expect(workspace).toContain("editing={selectedIsEditing}");
    expect(artistCard).toContain('className="client-owned-artist-editor"');
    expect(artistCard).toContain('className="client-owned-artist-archive-section"');
    expect(artistCard).toContain("onEditingChange(artist.id, false)");
    expect(artistCard).not.toContain('className="client-owned-artist-header-actions"');
    expect(artistCard).not.toContain('className="client-owned-artist-delete"');
    expect(talentStyles).toMatch(/\.client-owned-artist-actions \{[\s\S]*?justify-content: flex-end;/);
    expect(talentStyles).toMatch(/\.client-owned-artist-archive-section \{[\s\S]*?border-top: 1px solid var\(--hfy-line\);/);
  });
});
