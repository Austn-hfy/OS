import "server-only";

import { and, count, eq, inArray, isNull, ne } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accountSetupTokens, auditLog, residencies, residencyContacts, residencyMemberships, users } from "@/db/schema";
import { buildAccountSetupUrl, issueAccountSetupToken } from "@/domain/account-setup";
import type { ResidencyActor } from "@/lib/auth";
import { passwordRecoveryRedirectUrl } from "@/lib/auth-redirect";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendResidencyAccountSetupEmail } from "@/services/account-setup-email";

export type ResidencyUserRole = "manager" | "calendar_viewer";

function requireManagingActor(actor: ResidencyActor) {
  if ((actor.actualAccessRole ?? actor.accessRole) !== "manager") throw new Error("Manager access is required.");
  if (actor.isClientViewAs) throw new Error("Exit View As before making account changes.");
}

function pendingDisplayName(email: string) {
  return email.split("@")[0]?.replaceAll(/[._-]+/g, " ").replaceAll(/\b\w/g, (value) => value.toUpperCase()) || email;
}

async function issueSetupCredential(actor: ResidencyActor, contactId: string) {
  const database = getDb();
  const [contact] = await database.select({
    id: residencyContacts.id,
    residencyId: residencyContacts.residencyId,
    name: residencyContacts.name,
    email: residencyContacts.email,
    userId: residencyContacts.userId,
    residencyName: residencies.name,
  }).from(residencyContacts)
    .innerJoin(residencies, eq(residencyContacts.residencyId, residencies.id))
    .where(and(
      eq(residencyContacts.id, contactId),
      eq(residencyContacts.residencyId, actor.residencyId),
      eq(residencyContacts.active, true),
      eq(residencyContacts.invitationStatus, "invited"),
    )).limit(1);
  if (!contact?.userId) throw new Error("This pending invitation is not ready to send.");

  const issuedAt = new Date();
  const credential = issueAccountSetupToken(issuedAt);
  const [setupToken] = await database.transaction(async (tx) => {
    await tx.update(accountSetupTokens).set({ revokedAt: issuedAt }).where(and(
      eq(accountSetupTokens.userId, contact.userId!),
      isNull(accountSetupTokens.usedAt),
      isNull(accountSetupTokens.revokedAt),
    ));
    return tx.insert(accountSetupTokens).values({
      userId: contact.userId!,
      residencyId: contact.residencyId,
      contactId: contact.id,
      tokenHash: credential.tokenHash,
      expiresAt: credential.expiresAt,
      createdByUserId: actor.userId,
      createdAt: issuedAt,
    }).returning({ id: accountSetupTokens.id });
  });
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://hfy.app";
  const delivery = await sendResidencyAccountSetupEmail({
    to: contact.email,
    contactName: contact.name,
    residencyName: contact.residencyName,
    setupUrl: buildAccountSetupUrl(siteUrl, credential.token),
    idempotencyKey: `residency-client-setup/${contact.id}/${setupToken.id}`,
  });
  await database.insert(auditLog).values({
    residencyId: contact.residencyId,
    actorUserId: actor.userId,
    actorLabel: actor.email,
    action: "residency_setup_email_sent",
    entityType: "residency_contact",
    entityId: contact.id,
    details: { setupTokenId: setupToken.id, expiresAt: credential.expiresAt.toISOString(), providerMessageId: delivery.providerMessageId },
  });
}

export async function inviteResidencyUsers(actor: ResidencyActor, emails: string[], role: ResidencyUserRole) {
  requireManagingActor(actor);
  const normalizedEmails = [...new Set(emails.map((email) => email.trim().toLocaleLowerCase()).filter(Boolean))];
  if (!normalizedEmails.length) throw new Error("Enter at least one email address.");
  const database = getDb();
  const [occupied] = await database.select({ value: count() }).from(residencyContacts).where(and(
    eq(residencyContacts.residencyId, actor.residencyId),
    eq(residencyContacts.active, true),
    inArray(residencyContacts.invitationStatus, ["invited", "active"]),
  ));
  if ((occupied?.value ?? 0) + normalizedEmails.length > 4) {
    throw new Error(`This Residency has ${occupied?.value ?? 0} of 4 user seats occupied. Reduce this invitation list and try again.`);
  }
  const existingContacts = await database.select({ id: residencyContacts.id, email: residencyContacts.email, active: residencyContacts.active })
    .from(residencyContacts).where(and(
      eq(residencyContacts.residencyId, actor.residencyId),
      inArray(residencyContacts.email, normalizedEmails),
    ));
  if (existingContacts.some((contact) => contact.active)) throw new Error("One or more email addresses already belong to this Residency.");

  const admin = createSupabaseAdminClient();
  const invitations: Array<{ contactId: string; email: string; sendSetup: boolean }> = [];
  for (const email of normalizedEmails) {
    const existingContact = existingContacts.find((contact) => contact.email.toLocaleLowerCase() === email);
    const name = pendingDisplayName(email);
    const [reserved] = existingContact
      ? await database.update(residencyContacts).set({
        name,
        email,
        accessRole: role,
        invitationStatus: "invited",
        active: true,
        invitedAt: new Date(),
        acceptedAt: null,
        revokedAt: null,
        invitedByUserId: actor.userId,
        isPrimary: false,
        updatedAt: new Date(),
      }).where(eq(residencyContacts.id, existingContact.id)).returning({ id: residencyContacts.id })
      : await database.insert(residencyContacts).values({
        residencyId: actor.residencyId,
        name,
        email,
        accessRole: role,
        invitationStatus: "invited",
        invitedAt: new Date(),
        invitedByUserId: actor.userId,
      }).returning({ id: residencyContacts.id });
    try {
      const [existingUser] = await database.select({ id: users.id, role: users.role, active: users.active }).from(users)
        .where(eq(users.email, email)).limit(1);
      if (existingUser?.role === "internal_admin") throw new Error("An HFY internal account cannot be invited as a Residency user.");
      let userId = existingUser?.id ?? null;
      let establishedAccount = Boolean(existingUser?.active);
      if (!userId) {
        const { data: created, error } = await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { display_name: name },
        });
        if (error || !created.user) throw error ?? new Error("The invitation account could not be created.");
        userId = created.user.id;
        establishedAccount = false;
      }
      await database.transaction(async (tx) => {
        await tx.insert(users).values({ id: userId!, email, displayName: name, role: "hotel_user", active: true })
          .onConflictDoUpdate({ target: users.id, set: { active: true, updatedAt: new Date() } });
        await tx.update(residencyContacts).set({
          userId,
          invitationStatus: establishedAccount ? "active" : "invited",
          acceptedAt: establishedAccount ? new Date() : null,
          updatedAt: new Date(),
        }).where(eq(residencyContacts.id, reserved.id));
        await tx.insert(residencyMemberships).values({
          userId: userId!,
          residencyId: actor.residencyId,
          accessRole: role,
          active: establishedAccount,
        }).onConflictDoUpdate({
          target: [residencyMemberships.userId, residencyMemberships.residencyId],
          set: { accessRole: role, active: establishedAccount, updatedAt: new Date() },
        });
        await tx.insert(auditLog).values({
          residencyId: actor.residencyId,
          actorUserId: actor.userId,
          actorLabel: actor.email,
          action: establishedAccount ? "residency_member_access_activated" : "residency_member_invited",
          entityType: "residency_contact",
          entityId: reserved.id,
          details: { email, accessRole: role, invitedByUserId: actor.userId },
        });
      });
      invitations.push({ contactId: reserved.id, email, sendSetup: !establishedAccount });
    } catch (error) {
      await database.update(residencyContacts).set({ active: false, invitationStatus: "revoked", revokedAt: new Date(), updatedAt: new Date() })
        .where(eq(residencyContacts.id, reserved.id));
      throw error;
    }
  }
  for (const invitation of invitations) {
    if (invitation.sendSetup) await issueSetupCredential(actor, invitation.contactId);
  }
  return { invited: invitations.length };
}

export async function resendResidencyInvitation(actor: ResidencyActor, contactId: string) {
  requireManagingActor(actor);
  const [contact] = await getDb().select({ status: residencyContacts.invitationStatus }).from(residencyContacts).where(and(
    eq(residencyContacts.id, contactId),
    eq(residencyContacts.residencyId, actor.residencyId),
    eq(residencyContacts.active, true),
  )).limit(1);
  if (contact?.status !== "invited") throw new Error("Only a pending invitation can be resent.");
  await issueSetupCredential(actor, contactId);
}

export async function requestResidencyUserPasswordReset(actor: ResidencyActor, contactId: string) {
  requireManagingActor(actor);
  const [contact] = await getDb().select({
    id: residencyContacts.id,
    email: residencyContacts.email,
    userId: residencyContacts.userId,
    status: residencyContacts.invitationStatus,
  }).from(residencyContacts).where(and(
    eq(residencyContacts.id, contactId),
    eq(residencyContacts.residencyId, actor.residencyId),
    eq(residencyContacts.active, true),
  )).limit(1);
  if (!contact?.userId || contact.status !== "active") throw new Error("Only an enrolled user can receive a password reset link.");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://hfy.app";
  const { error } = await createSupabaseAdminClient().auth.resetPasswordForEmail(contact.email, {
    redirectTo: passwordRecoveryRedirectUrl(siteUrl),
  });
  if (error) throw error;

  await getDb().insert(auditLog).values({
    residencyId: actor.residencyId,
    actorUserId: actor.userId,
    actorLabel: actor.email,
    action: "residency_member_password_reset_requested",
    entityType: "residency_contact",
    entityId: contact.id,
    details: { targetUserId: contact.userId, email: contact.email },
  });
}

export async function changeResidencyUserRole(actor: ResidencyActor, contactId: string, role: ResidencyUserRole) {
  requireManagingActor(actor);
  const database = getDb();
  const [contact] = await database.select({
    id: residencyContacts.id,
    userId: residencyContacts.userId,
    previousRole: residencyContacts.accessRole,
    status: residencyContacts.invitationStatus,
  }).from(residencyContacts).where(and(
    eq(residencyContacts.id, contactId),
    eq(residencyContacts.residencyId, actor.residencyId),
    eq(residencyContacts.active, true),
  )).limit(1);
  if (!contact?.userId || !contact.previousRole) throw new Error("User not found.");
  if (contact.userId === actor.userId && contact.previousRole === "manager" && role !== "manager") {
    throw new Error("You cannot remove your own manager access.");
  }
  if (contact.previousRole === role) return;
  const changedAt = new Date();
  await database.transaction(async (tx) => {
    await tx.update(residencyMemberships).set({ accessRole: role, updatedAt: changedAt }).where(and(
      eq(residencyMemberships.userId, contact.userId!),
      eq(residencyMemberships.residencyId, actor.residencyId),
    ));
    await tx.update(residencyContacts).set({ accessRole: role, roleChangedAt: changedAt, roleChangedByUserId: actor.userId, updatedAt: changedAt })
      .where(eq(residencyContacts.id, contact.id));
    await tx.insert(auditLog).values({
      residencyId: actor.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "residency_member_role_changed",
      entityType: "residency_contact",
      entityId: contact.id,
      details: { previousRole: contact.previousRole, newRole: role, targetUserId: contact.userId },
    });
  });
}

export async function removeResidencyUser(actor: ResidencyActor, contactId: string) {
  requireManagingActor(actor);
  const database = getDb();
  const [contact] = await database.select().from(residencyContacts).where(and(
    eq(residencyContacts.id, contactId),
    eq(residencyContacts.residencyId, actor.residencyId),
    eq(residencyContacts.active, true),
  )).limit(1);
  if (!contact) throw new Error("User not found.");
  if (contact.userId === actor.userId) throw new Error("You cannot remove your own account access.");
  if (contact.isPrimary) throw new Error("Choose a different primary contact before removing this user.");
  const removedAt = new Date();
  await database.transaction(async (tx) => {
    if (contact.userId) {
      await tx.update(residencyMemberships).set({ active: false, updatedAt: removedAt }).where(and(
        eq(residencyMemberships.userId, contact.userId),
        eq(residencyMemberships.residencyId, actor.residencyId),
      ));
      await tx.update(accountSetupTokens).set({ revokedAt: removedAt }).where(and(
        eq(accountSetupTokens.userId, contact.userId),
        isNull(accountSetupTokens.usedAt),
        isNull(accountSetupTokens.revokedAt),
      ));
      const [remaining] = await tx.select({ value: count() }).from(residencyMemberships).where(and(
        eq(residencyMemberships.userId, contact.userId),
        eq(residencyMemberships.active, true),
      ));
      if ((remaining?.value ?? 0) === 0) await tx.update(users).set({ active: false, updatedAt: removedAt }).where(and(
        eq(users.id, contact.userId),
        eq(users.role, "hotel_user"),
      ));
    }
    await tx.update(residencyContacts).set({ active: false, invitationStatus: "revoked", revokedAt: removedAt, updatedAt: removedAt })
      .where(eq(residencyContacts.id, contact.id));
    await tx.insert(auditLog).values({
      residencyId: actor.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: contact.invitationStatus === "invited" ? "residency_member_invitation_revoked" : "residency_member_removed",
      entityType: "residency_contact",
      entityId: contact.id,
      details: { targetUserId: contact.userId, email: contact.email, previousRole: contact.accessRole },
    });
  });
}

export async function setPrimaryResidencyContact(actor: ResidencyActor, contactId: string) {
  requireManagingActor(actor);
  const database = getDb();
  const [contact] = await database.select({
    id: residencyContacts.id,
    userId: residencyContacts.userId,
    name: residencyContacts.name,
    email: residencyContacts.email,
    phone: residencyContacts.phone,
    status: residencyContacts.invitationStatus,
  }).from(residencyContacts).where(and(
    eq(residencyContacts.id, contactId),
    eq(residencyContacts.residencyId, actor.residencyId),
    eq(residencyContacts.active, true),
  )).limit(1);
  if (!contact?.userId || contact.status !== "active") throw new Error("Only an active enrolled user can be the primary contact.");
  await database.transaction(async (tx) => {
    await tx.update(residencyContacts).set({ isPrimary: false, updatedAt: new Date() }).where(and(
      eq(residencyContacts.residencyId, actor.residencyId),
      eq(residencyContacts.isPrimary, true),
      ne(residencyContacts.id, contact.id),
    ));
    await tx.update(residencyContacts).set({ isPrimary: true, updatedAt: new Date() }).where(eq(residencyContacts.id, contact.id));
    await tx.update(residencies).set({
      primaryContactName: contact.name,
      primaryContactEmail: contact.email,
      primaryContactPhone: contact.phone,
      updatedAt: new Date(),
    }).where(eq(residencies.id, actor.residencyId));
    await tx.insert(auditLog).values({
      residencyId: actor.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "residency_primary_contact_changed",
      entityType: "residency_contact",
      entityId: contact.id,
      details: { targetUserId: contact.userId },
    });
  });
}
