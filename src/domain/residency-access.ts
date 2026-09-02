export type ResidencyAccessRole = "manager" | "calendar_viewer";
export type ResidencyClientCapability = "overview" | "calendar" | "talent" | "finances" | "settings" | "manage_dayparts" | "share_calendar";

export function canResidencyRoleAccess(role: ResidencyAccessRole, capability: ResidencyClientCapability): boolean {
  if (capability === "calendar") return true;
  return role === "manager";
}
