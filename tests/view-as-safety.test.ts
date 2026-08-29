import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("owner View As safety", () => {
  it("hides Daypart financial controls just like the Residency-member workspace", async () => {
    const source = await readFile(new URL("../src/components/internal-shell.tsx", import.meta.url), "utf8");
    const viewAsBranch = source.match(/if \(viewAsResidency\) \{([\s\S]*?)\n  \}\n\n  return \(/)?.[1] ?? "";

    expect(viewAsBranch).toContain("<DayPartsPanel");
    expect(viewAsBranch).toContain("hideFinancials");
  });
});
