import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Daypart type language", () => {
  it("presents talent-backed programming as a Talent Activity", async () => {
    const manager = await readFile(new URL("../src/app/app/setup/daypart-manager.tsx", import.meta.url), "utf8");

    expect(manager).toContain("<strong>Talent Activity</strong>");
    expect(manager).toContain("Assignments and financial tracking follow the billing choice you select next.");
    expect(manager).toContain("Choose Talent Activity or House Activity to continue.");
    expect(manager).not.toContain("DJ / Artist");
  });

  it("keeps the existing palette while restricting edits to a room hue", async () => {
    const [manager, dayparts, picker, styles] = await Promise.all([
      readFile(new URL("../src/app/app/setup/daypart-manager.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/domain/dayparts.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/components/daypart-color-picker.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
    ]);

    expect(dayparts).toContain('label: "Ocean blue"');
    expect(dayparts).toContain('label: "Coral"');
    expect(dayparts).toContain('label: "Deep teal"');
    expect(dayparts.indexOf('label: "Dark"')).toBeLessThan(dayparts.indexOf('label: "Medium"'));
    expect(dayparts.indexOf('label: "Medium"')).toBeLessThan(dayparts.indexOf('label: "Light"'));
    expect(picker).toContain("DAYPART_COLOR_PRESET_ROWS.map");
    expect(manager).toContain("<DaypartColorPicker");
    expect(manager).not.toContain("The room’s hue stays fixed");
    expect(manager).toContain("hue={draft.roomHue}");
    expect(picker).toContain("roomShadeColors(hue)");
    expect(styles).toContain(".daypart-color-spectrum.single-hue { display: flex;");
    expect(manager).not.toContain('aria-label="Daypart color" type="color"');
  });
});
