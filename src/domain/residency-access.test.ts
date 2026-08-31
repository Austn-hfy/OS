import { describe, expect, it } from "vitest";
import { canResidencyRoleAccess } from "./residency-access";

describe("Residency client access", () => {
  it("allows managers to see the safe overview and calendar", () => {
    expect(canResidencyRoleAccess("manager", "overview")).toBe(true);
    expect(canResidencyRoleAccess("manager", "calendar")).toBe(true);
    expect(canResidencyRoleAccess("manager", "talent")).toBe(true);
    expect(canResidencyRoleAccess("manager", "payout_status")).toBe(true);
    expect(canResidencyRoleAccess("manager", "invoices")).toBe(true);
    expect(canResidencyRoleAccess("manager", "settings")).toBe(true);
    expect(canResidencyRoleAccess("manager", "manage_dayparts")).toBe(true);
    expect(canResidencyRoleAccess("manager", "share_calendar")).toBe(true);
  });

  it("keeps calendar viewers on the read-only calendar", () => {
    expect(canResidencyRoleAccess("calendar_viewer", "calendar")).toBe(true);
    expect(canResidencyRoleAccess("calendar_viewer", "overview")).toBe(false);
    expect(canResidencyRoleAccess("calendar_viewer", "talent")).toBe(false);
    expect(canResidencyRoleAccess("calendar_viewer", "payout_status")).toBe(false);
    expect(canResidencyRoleAccess("calendar_viewer", "invoices")).toBe(false);
    expect(canResidencyRoleAccess("calendar_viewer", "settings")).toBe(false);
    expect(canResidencyRoleAccess("calendar_viewer", "manage_dayparts")).toBe(false);
  });
});
