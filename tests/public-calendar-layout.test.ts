import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("public calendar layout", () => {
  it("keeps the agenda visually separate from the calendar without flattening either surface", async () => {
    const styles = await readFile(new URL("../src/app/hfy-style-pilot.css", import.meta.url), "utf8");
    const agendaDayRule = styles.match(/\.hfy-style-system \.public-calendar-agenda-day \{([^}]*)\}/)?.[1] ?? "";

    expect(styles).toContain("grid-template-columns: minmax(0, 1.95fr) minmax(400px, 1fr)");
    expect(styles).toContain("gap: 18px");
    expect(styles).toMatch(/\.public-calendar-agenda \{[\s\S]*?border-radius: 20px;[\s\S]*?box-shadow:/);
    expect(styles).toMatch(/\.public-calendar-agenda-list \{[\s\S]*?gap: 15px;[\s\S]*?overflow-y: auto;/);
    expect(agendaDayRule).not.toContain("border-bottom");
  });

  it("wraps opened event content and gives every constrained panel its own safe scroll behavior", async () => {
    const styles = await readFile(new URL("../src/app/hfy-style-pilot.css", import.meta.url), "utf8");

    expect(styles).toMatch(/\.public-calendar-agenda-entry strong,[\s\S]*?overflow-wrap: anywhere;[\s\S]*?white-space: normal;/);
    expect(styles).toMatch(/\.public-calendar-detail \{[\s\S]*?min-width: 0;[\s\S]*?overflow: hidden;/);
    expect(styles).toMatch(/\.public-calendar-detail-body \{[\s\S]*?overflow-x: hidden;[\s\S]*?overflow-y: auto;/);
    expect(styles).toMatch(/\.public-calendar-detail-body \{[\s\S]*?grid-auto-rows: max-content;/);
    expect(styles).toMatch(/\.public-calendar-detail-heading h2 \{[\s\S]*?overflow-wrap: anywhere;/);
    expect(styles).toMatch(/\.public-calendar-detail-summary strong \{[\s\S]*?overflow-wrap: anywhere;[\s\S]*?white-space: normal;/);
    expect(styles).toMatch(/\.public-calendar-artist strong,[\s\S]*?overflow-wrap: anywhere;/);
    expect(styles).toContain(".public-calendar-detail { max-height: 560px; }");
  });

  it("keeps the opened event hierarchy compact and aligned at every breakpoint", async () => {
    const styles = await readFile(new URL("../src/app/hfy-style-pilot.css", import.meta.url), "utf8");

    expect(styles).toMatch(/\.public-calendar-agenda-heading h2 \{[^}]*margin: 0;[^}]*line-height: 1\.1;/);
    expect(styles).toMatch(/\.public-calendar-detail-heading \{[^}]*gap: 0;[^}]*padding: 18px;/);
    expect(styles).toMatch(/\.public-calendar-detail-heading h2 \{[^}]*margin: 0;[^}]*clamp\(20px, 1\.55vw, 24px\)/);
    expect(styles).toMatch(/\.public-calendar-detail-body \{[^}]*padding: 0 18px 18px;/);
    expect(styles).toMatch(/@media \(max-width: 850px\)[\s\S]*?\.public-calendar-detail-heading \{ padding: 16px; \}[\s\S]*?\.public-calendar-detail-body \{ padding: 0 16px 16px; \}/);
    expect(styles).toMatch(/@media \(max-width: 520px\)[\s\S]*?\.public-calendar-detail-heading \{ padding: 14px; \}[\s\S]*?\.public-calendar-detail-body \{ padding: 0 14px 14px; \}/);
  });
});
