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

  it("offers a broad preset-only calendar palette", async () => {
    const manager = await readFile(new URL("../src/app/app/setup/daypart-manager.tsx", import.meta.url), "utf8");

    expect(manager).toContain('label: "Ocean blue"');
    expect(manager).toContain('label: "Coral"');
    expect(manager).toContain('label: "Deep teal"');
    expect(manager).toContain("Choose from 24 preset shades.");
    expect(manager).not.toContain('aria-label="Daypart color" type="color"');
  });
});
