export type ResidencyAccessRole = "manager" | "calendar_viewer";
export type ResidencyClientCapability = "overview" | "calendar";

export function canResidencyRoleAccess(role: ResidencyAccessRole, capability: ResidencyClientCapability): boolean {
  if (capability === "calendar") return true;
  return role === "manager";
}
