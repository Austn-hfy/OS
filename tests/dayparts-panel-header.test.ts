import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Day Parts panel header", () => {
  it("uses the Weekly Daypart grid as its single visible heading", async () => {
    const [panel, manager] = await Promise.all([
      readFile(new URL("../src/components/day-parts-panel.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/app/setup/daypart-manager.tsx", import.meta.url), "utf8"),
    ]);

    expect(panel).not.toContain("day-parts-panel-header");
    expect(panel).not.toContain('>Day Parts</h2>');
    expect(panel).toContain('aria-label={`${residencyName} Day Parts`}');
    expect(panel).toContain("onClose={onClose}");
    expect(manager).toContain("<h2>Weekly Daypart grid</h2>");
    expect(manager).toContain('aria-label="Close Day Parts"');
  });
});
