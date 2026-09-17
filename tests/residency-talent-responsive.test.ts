import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

describe("Residency Talent responsive layout", () => {
  it("keeps the shared V1 hierarchy around the Talent-specific workspace", async () => {
    const [page, workspace, artistCard, designSystem] = await Promise.all([
      readSource("../src/app/residency/talent/page.tsx"),
      readSource("../src/app/residency/talent/client-artist-lookup.tsx"),
      readSource("../src/app/residency/talent/client-owned-artist-card.tsx"),
      readSource("../src/components/residency-design-system.tsx"),
    ]);

    expect(page).toContain("ResidencyPageSurface");
    expect(page).not.toContain("WorkspaceSurface");
    expect(workspace).toContain("ResidencyPageHeader");
    expect(workspace).toContain("ResidencyPageBody");
    expect(workspace).toContain("ResidencyCollectionPanel");
    expect(workspace).toContain("ResidencyCollectionSearch");
    expect(workspace).toContain("ResidencyCollectionFilters");
    expect(workspace).toContain("ResidencyCollectionUtility");
    expect(workspace).toContain("ResidencyCollectionRow");
    expect(workspace).toContain("ResidencySectionHeader");
    expect(artistCard).toContain("ResidencyFactGrid");
    expect(designSystem).toContain("export function ResidencyCollectionPanel");
    expect(designSystem).toContain("export function ResidencyCollectionRow");
  });

  it("uses one declared split-to-stack transition and protects the detail width", async () => {
    const styles = await readSource("../src/app/hfy-style-pilot.css");
    const talentStyles = styles.slice(styles.indexOf("/* Residency Talent uses the V1 surface hierarchy"));
    const collectionStyles = styles.slice(styles.indexOf("/* Compact Collection Panel"), styles.indexOf("/* Residency Talent uses the V1 surface hierarchy"));

    expect(talentStyles).toContain("container-name: residency-talent-workspace");
    expect(talentStyles).toContain("grid-template-columns: minmax(280px, .68fr) minmax(520px, 1.32fr)");
    expect(collectionStyles).toMatch(/\.residency-collection-panel \{[\s\S]*?min-height: 0;[\s\S]*?max-height: var\(--hfy-collection-panel-scroll-ceiling\);[\s\S]*?align-self: start;/);
    expect(talentStyles).toContain("@container residency-talent-workspace (max-width: 940px)");
    expect(talentStyles).toMatch(/@container residency-talent-workspace \(max-width: 940px\)[\s\S]*?grid-template-columns: 1fr;/);
    expect(talentStyles).toMatch(/@container residency-talent-workspace \(max-width: 940px\)[\s\S]*?\.residency-collection-panel \{[\s\S]*?max-height: var\(--hfy-collection-panel-scroll-ceiling-compact\);/);
  });

  it("moves the approved roster contract into semantic shared tokens and components", async () => {
    const [workspace, artistCard, styles, tokens] = await Promise.all([
      readSource("../src/app/residency/talent/client-artist-lookup.tsx"),
      readSource("../src/app/residency/talent/client-owned-artist-card.tsx"),
      readSource("../src/app/hfy-style-pilot.css"),
      readSource("../src/app/hfy-design-tokens.css"),
    ]);
    const collectionStyles = styles.slice(styles.indexOf("/* Compact Collection Panel"), styles.indexOf("/* Residency Talent uses the V1 surface hierarchy"));
    const talentStyles = styles.slice(styles.indexOf("/* Residency Talent uses the V1 surface hierarchy"));

    expect(workspace).not.toContain("residency-talent-filter-tabs");
    expect(workspace).not.toContain("residency-talent-roster-card");
    expect(collectionStyles).toMatch(/\.residency-collection-toolbar \{[\s\S]*?padding: var\(--hfy-surface-card-padding\) 0;/);
    expect(collectionStyles).toMatch(/\.residency-collection-filters \{[\s\S]*?width: 100%;[\s\S]*?margin-inline: 0;/);
    expect(collectionStyles).toMatch(/\.residency-collection-search input \{[\s\S]*?font-size: var\(--hfy-collection-search-size\);/);
    expect(collectionStyles).toMatch(/\.residency-collection-utility label \{[\s\S]*?display: flex;[\s\S]*?align-items: center;/);
    expect(collectionStyles).toMatch(/\.residency-collection-row-heading > strong \{[\s\S]*?font-size: var\(--hfy-collection-row-title-size\);/);
    expect(collectionStyles).toMatch(/\.residency-collection-filters > div \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
    expect(collectionStyles).toMatch(/\.residency-collection-filters\[data-tab-count="1"\] > div \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/);
    for (const token of [
      "--hfy-collection-panel-scroll-ceiling: 680px",
      "--hfy-collection-label-size: 10px",
      "--hfy-collection-search-size: 14px",
      "--hfy-collection-filter-size: 10px",
      "--hfy-collection-count-size: 10px",
      "--hfy-collection-sort-value-size: 11px",
      "--hfy-collection-row-title-size: 12px",
      "--hfy-collection-row-meta-size: 10px",
      "--hfy-collection-chip-size: 9px",
      "--hfy-collection-row-padding-block: var(--hfy-space-3)",
      "--hfy-collection-row-padding-inline: 14px",
    ]) expect(tokens).toContain(token);

    expect(workspace).toContain("!selected.archivedAt && !selectedIsEditing");
    expect(workspace).toContain("editing={selectedIsEditing}");
    expect(artistCard).toContain('className="client-owned-artist-editor"');
    expect(artistCard).toContain('className="client-owned-artist-archive-section"');
    expect(artistCard).toContain("onEditingChange(artist.id, false)");
    expect(artistCard).not.toContain('className="client-owned-artist-header-actions"');
    expect(artistCard).not.toContain('className="client-owned-artist-delete"');
    expect(talentStyles).toMatch(/\.client-owned-artist-actions \{[\s\S]*?justify-content: flex-end;/);
    expect(talentStyles).toMatch(/\.client-owned-artist-archive-section \{[\s\S]*?border-top: 1px solid var\(--hfy-line\);/);
    expect(talentStyles).toMatch(/\.residency-talent-detail-card \.client-safe-talent-card \{[\s\S]*?padding-bottom: var\(--hfy-space-6\);/);
    expect(talentStyles).toMatch(/\.residency-talent-detail-card \.client-artist-facts \.residency-fact-grid \{[\s\S]*?row-gap: var\(--hfy-space-6\);/);
    expect(talentStyles).toMatch(/\.residency-talent-detail-card > \.artist-detail-section \{[\s\S]*?padding-block: var\(--hfy-space-6\);/);
  });
});
