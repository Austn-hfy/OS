export type ResidencyAccessRole = "manager" | "calendar_viewer";
export type ResidencyClientCapability = "overview" | "calendar" | "talent" | "payout_status" | "manage_dayparts" | "share_calendar";

export function canResidencyRoleAccess(role: ResidencyAccessRole, capability: ResidencyClientCapability): boolean {
  if (capability === "calendar") return true;
  return role === "manager";
}
