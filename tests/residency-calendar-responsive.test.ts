import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

describe("Residency Calendar desktop contract", () => {
  it("uses the Residency-only header grammar without changing the shared owner Calendar", async () => {
    const [page, calendar] = await Promise.all([
      readSource("../src/app/residency/calendar/page.tsx"),
      readSource("../src/app/app/calendar/residency-calendar.tsx"),
    ]);

    expect(page).toContain('headerEyebrow={`${actor.residencyName} · Calendar`}');
    expect(calendar).toContain("headerEyebrow?: string");
    expect(calendar).toContain("{headerEyebrow ?? residency.name}");
  });

  it("locks readable Calendar type and clean one-to-two-row command transitions", async () => {
    const [tokens, globals, styles, designSystem, audit] = await Promise.all([
      readSource("../src/app/hfy-design-tokens.css"),
      readSource("../src/app/globals.css"),
      readSource("../src/app/hfy-style-pilot.css"),
      readSource("../docs/DESIGN_SYSTEM_V1.md"),
      readSource("../docs/UI_UX_DESKTOP_AUDIT_CLIENT_RESIDENCY.md"),
    ]);

    for (const token of [
      "--hfy-calendar-weekday-size: 10px",
      "--hfy-calendar-event-title-size: 10px",
      "--hfy-calendar-event-meta-size: 10px",
      "--hfy-calendar-week-event-title-size: 12px",
      "--hfy-calendar-week-event-meta-size: 10px",
    ]) expect(tokens).toContain(token);

    expect(globals).toContain(".month-calendar-wrap.compact .calendar-event-line strong { font-size: 8px; }");
    expect(styles).toContain("font-size: var(--hfy-calendar-event-title-size)");
    expect(styles).toContain("font-size: var(--hfy-calendar-event-meta-size)");
    expect(styles).toContain("container-name: calendar-command-secondary");
    expect(styles).toContain("@container calendar-command-secondary (max-width: 920px)");
    expect(styles).toMatch(/@container calendar-command-secondary \(max-width: 920px\)[\s\S]*?\.calendar-toolbar-filters \{[\s\S]*?grid-column: 1 \/ -1;[\s\S]*?width: 100%;/);
    expect(styles).toMatch(/@container calendar-command-secondary \(max-width: 920px\)[\s\S]*?\.calendar-toolbar-view \{ justify-self: start; \}/);
    expect(styles).toMatch(/@container calendar-command-secondary \(max-width: 920px\)[\s\S]*?\.calendar-toolbar-actions \{ justify-self: end; \}/);
    expect(styles).toMatch(/\.calendar-main \.week-calendar \{[\s\S]*?min-width: 0;[\s\S]*?repeat\(7, minmax\(0, 1fr\)\);/);
    expect(styles).toContain(".hfy-style-system .client-shell .main.calendar-main { padding-top: 38px;");
    expect(styles).toContain(".main:has(> .calendar-page) > .view-as-banner");
    expect(designSystem).toContain("## Calendar Implementation Profile");
    expect(designSystem).toContain("At `920px` or narrower");
    expect(audit).toContain("CR-006A — Calendar command bar and Week view break at compact desktop widths");
    expect(audit).toContain("Status: **resolved for Residency Calendar desktop**");
  });
});
