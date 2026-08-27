import { describe, expect, it } from "vitest";
import { privacyModeEnabled } from "./privacy-mode";

describe("Privacy Mode cookie", () => {
  it("enables only for the explicit persisted value", () => {
    expect(privacyModeEnabled("1")).toBe(true);
    expect(privacyModeEnabled("0")).toBe(false);
    expect(privacyModeEnabled(undefined)).toBe(false);
  });
});
