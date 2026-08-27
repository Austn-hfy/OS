import { describe, expect, it } from "vitest";
import { safeAuthRedirect } from "./auth-redirect";

describe("safeAuthRedirect", () => {
  it("allows app-local paths", () => {
    expect(safeAuthRedirect("/reset-password")).toBe("/reset-password");
  });

  it("rejects absolute and protocol-relative destinations", () => {
    expect(safeAuthRedirect("https://example.com")).toBe("/");
    expect(safeAuthRedirect("//example.com")).toBe("/");
  });

  it("uses the requested fallback for missing values", () => {
    expect(safeAuthRedirect(null, "/reset-password")).toBe("/reset-password");
  });
});
