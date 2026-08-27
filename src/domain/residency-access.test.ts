import { describe, expect, it } from "vitest";
import { canResidencyRoleAccess } from "./residency-access";

describe("Residency client access", () => {
  it("allows managers to see the safe overview and calendar", () => {
    expect(canResidencyRoleAccess("manager", "overview")).toBe(true);
    expect(canResidencyRoleAccess("manager", "calendar")).toBe(true);
  });

  it("keeps calendar viewers on the read-only calendar", () => {
    expect(canResidencyRoleAccess("calendar_viewer", "calendar")).toBe(true);
    expect(canResidencyRoleAccess("calendar_viewer", "overview")).toBe(false);
  });
});
