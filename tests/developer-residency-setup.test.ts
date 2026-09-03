import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Developer Residency setup", () => {
  it("keeps rates and roster management out of the Developer setup screen", async () => {
    const page = await readFile(new URL("../src/app/app/setup/page.tsx", import.meta.url), "utf8");

    expect(page).toContain("<ResidencyProfileEditor");
    expect(page).toContain("<ResidencyContactsManager");
    expect(page).not.toContain("ResidencyRateEditor");
    expect(page).not.toContain("ApprovedDjManager");
    expect(page).not.toContain("data.talent");
    expect(page).not.toContain("data.approvals");
  });
});
