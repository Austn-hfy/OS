import { and, eq, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { residencies, residencyContacts, residencyMemberships, users } from "@/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type InternalActor = {
  kind: "internal";
  userId: string;
  email: string;
  displayName: string;
};

export type ResidencyActor = {
  kind: "residency";
  userId: string;
  email: string;
  displayName: string;
  residencyId: string;
  residencyName: string;
  residencyTimezone: string;
  accessRole: "manager" | "calendar_viewer";
};

export type AuditActor = InternalActor | ResidencyActor;

async function currentProfile() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const [profile] = await getDb().select().from(users).where(and(eq(users.id, data.user.id), eq(users.active, true))).limit(1);
  if (!profile) return null;
  return { authUser: data.user, profile };
}

export async function requireInternalActor(): Promise<InternalActor> {
  const current = await currentProfile();
  if (!current) redirect("/login");
  if (current.profile.role !== "internal_admin") redirect("/login");
  return {
    kind: "internal",
    userId: current.profile.id,
    email: current.profile.email,
    displayName: current.profile.displayName,
  };
}

export async function requireResidencyActor(): Promise<ResidencyActor> {
  const current = await currentProfile();
  if (!current) redirect("/login");
  if (current.profile.role !== "hotel_user") redirect("/login");
  const [membership] = await getDb().select({
    residencyId: residencyMemberships.residencyId,
    residencyName: residencies.name,
    residencyTimezone: residencies.timezone,
    accessRole: residencyMemberships.accessRole,
  }).from(residencyMemberships)
    .innerJoin(residencies, eq(residencyMemberships.residencyId, residencies.id))
    .where(and(
      eq(residencyMemberships.userId, current.profile.id),
      eq(residencyMemberships.active, true),
      eq(residencies.active, true),
      eq(residencies.operatingMode, "operations"),
    ))
    .limit(1);
  if (!membership) redirect("/login");
  await getDb().update(residencyContacts).set({ invitationStatus: "active", acceptedAt: new Date(), updatedAt: new Date() }).where(and(
    eq(residencyContacts.userId, current.profile.id),
    eq(residencyContacts.residencyId, membership.residencyId),
    ne(residencyContacts.invitationStatus, "active"),
  ));
  return {
    kind: "residency",
    userId: current.profile.id,
    email: current.profile.email,
    displayName: current.profile.displayName,
    residencyId: membership.residencyId,
    residencyName: membership.residencyName,
    residencyTimezone: membership.residencyTimezone,
    accessRole: membership.accessRole,
  };
}

export async function requireActorForResidency(
  residencyId: string,
  options: { manager?: boolean } = {},
): Promise<AuditActor> {
  const current = await currentProfile();
  if (!current) throw new Error("Sign in to continue.");
  if (current.profile.role === "internal_admin") {
    return {
      kind: "internal",
      userId: current.profile.id,
      email: current.profile.email,
      displayName: current.profile.displayName,
    };
  }
  if (current.profile.role !== "hotel_user") throw new Error("This account cannot access a Residency.");
  const [membership] = await getDb().select({
    residencyId: residencyMemberships.residencyId,
    residencyName: residencies.name,
    residencyTimezone: residencies.timezone,
    accessRole: residencyMemberships.accessRole,
  }).from(residencyMemberships)
    .innerJoin(residencies, eq(residencyMemberships.residencyId, residencies.id))
    .where(and(
      eq(residencyMemberships.userId, current.profile.id),
      eq(residencyMemberships.residencyId, residencyId),
      eq(residencyMemberships.active, true),
      eq(residencies.active, true),
      eq(residencies.operatingMode, "operations"),
    ))
    .limit(1);
  if (!membership) throw new Error("You do not have access to this Residency.");
  if (options.manager && membership.accessRole !== "manager") {
    throw new Error("Manager access is required for this change.");
  }
  return {
    kind: "residency",
    userId: current.profile.id,
    email: current.profile.email,
    displayName: current.profile.displayName,
    residencyId: membership.residencyId,
    residencyName: membership.residencyName,
    residencyTimezone: membership.residencyTimezone,
    accessRole: membership.accessRole,
  };
}

export async function getSignedInDestination(): Promise<"/app" | "/residency" | "/login"> {
  const current = await currentProfile();
  if (!current) return "/login";
  return current.profile.role === "internal_admin" ? "/app" : "/residency";
}
