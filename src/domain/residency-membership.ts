export type ResidencyMembershipOption = {
  residencyId: string;
  residencyName: string;
  residencyTimezone: string;
  clientPaymentStatusVisible: boolean;
  accessRole: "manager" | "calendar_viewer";
  contactId: string | null;
  invitationStatus: "not_invited" | "invited" | "active" | "revoked" | null;
  needsDaypartRateAttention?: boolean;
};

export function selectResidencyMembership(
  memberships: ResidencyMembershipOption[],
  selectedResidencyId: string | undefined,
  isInternalTest: boolean,
): ResidencyMembershipOption | null {
  if (!memberships.length) return null;
  if (!isInternalTest) return memberships[0];
  return memberships.find((membership) => membership.residencyId === selectedResidencyId) ?? memberships[0];
}

export function clientVisibleAccessContacts<T extends { isInternalTest: boolean }>(contacts: T[]): T[] {
  return contacts.filter((contact) => !contact.isInternalTest);
}
