import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Daypart date validation", () => {
  it("keeps a missing-date error inline with the weekly date controls", async () => {
    const manager = await readFile(new URL("../src/app/app/setup/daypart-manager.tsx", import.meta.url), "utf8");

    expect(manager).toContain("event.preventDefault()");
    expect(manager).toContain("Please pick a date.");
    expect(manager).toContain('className={`week-rule-selection ${showDateValidation ? "invalid" : ""}`}');
    expect(manager).toContain('state.status === "error" && !missingDateServerError');
  });
});
