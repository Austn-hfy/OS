import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLog, residencyContacts, residencyMemberships, users } from "@/db/schema";

export async function getResidencyUsers(residencyId: string) {
  const database = getDb();
  const contacts = await database.select({
    id: residencyContacts.id,
    userId: residencyContacts.userId,
    name: residencyContacts.name,
    email: residencyContacts.email,
    phone: residencyContacts.phone,
    accessRole: residencyContacts.accessRole,
    invitationStatus: residencyContacts.invitationStatus,
    isPrimary: residencyContacts.isPrimary,
    invitedAt: residencyContacts.invitedAt,
    acceptedAt: residencyContacts.acceptedAt,
    invitedByUserId: residencyContacts.invitedByUserId,
    roleChangedAt: residencyContacts.roleChangedAt,
    roleChangedByUserId: residencyContacts.roleChangedByUserId,
    membershipActive: residencyMemberships.active,
    membershipId: residencyMemberships.id,
  }).from(residencyContacts)
    .leftJoin(residencyMemberships, and(
      eq(residencyMemberships.residencyId, residencyContacts.residencyId),
      eq(residencyMemberships.userId, residencyContacts.userId),
    ))
    .where(and(
      eq(residencyContacts.residencyId, residencyId),
      eq(residencyContacts.active, true),
      inArray(residencyContacts.invitationStatus, ["invited", "active"]),
    ))
    .orderBy(desc(residencyContacts.isPrimary), asc(residencyContacts.name), asc(residencyContacts.email));

  const relatedUserIds = [...new Set(contacts.flatMap((contact) => [
    contact.invitedByUserId,
    contact.roleChangedByUserId,
  ].filter((value): value is string => Boolean(value))))];
  const people = relatedUserIds.length
    ? await database.select({ id: users.id, displayName: users.displayName, email: users.email })
      .from(users).where(inArray(users.id, relatedUserIds))
    : [];
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const contactIds = contacts.map((contact) => contact.id);
  const roleEvents = contactIds.length
    ? await database.select({
      contactId: auditLog.entityId,
      actorLabel: auditLog.actorLabel,
      details: auditLog.details,
      createdAt: auditLog.createdAt,
    }).from(auditLog).where(and(
      eq(auditLog.residencyId, residencyId),
      eq(auditLog.action, "residency_member_role_changed"),
      inArray(auditLog.entityId, contactIds),
    )).orderBy(desc(auditLog.createdAt))
    : [];

  return contacts.map((contact) => ({
    ...contact,
    state: contact.invitationStatus === "active" && contact.membershipActive ? "active" as const : "pending" as const,
    invitedAt: contact.invitedAt?.toISOString() ?? null,
    acceptedAt: contact.acceptedAt?.toISOString() ?? null,
    roleChangedAt: contact.roleChangedAt?.toISOString() ?? null,
    invitedBy: contact.invitedByUserId ? peopleById.get(contact.invitedByUserId) ?? null : null,
    roleChangedBy: contact.roleChangedByUserId ? peopleById.get(contact.roleChangedByUserId) ?? null : null,
    roleHistory: roleEvents.filter((event) => event.contactId === contact.id).map((event) => ({
      actor: event.actorLabel,
      previousRole: typeof event.details.previousRole === "string" ? event.details.previousRole : null,
      newRole: typeof event.details.newRole === "string" ? event.details.newRole : null,
      changedAt: event.createdAt.toISOString(),
    })),
  }));
}
