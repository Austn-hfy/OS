import { describe, expect, it } from "vitest";
import { isJoinEnabled } from "./gate";

describe("artist onboarding gate", () => {
  it("fails closed unless the flag is explicitly enabled", () => {
    expect(isJoinEnabled(undefined)).toBe(false);
    expect(isJoinEnabled("0")).toBe(false);
    expect(isJoinEnabled("true")).toBe(false);
  });

  it("opens only for JOIN_ENABLED=1", () => {
    expect(isJoinEnabled("1")).toBe(true);
  });
});
