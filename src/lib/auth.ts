import { cache } from "react";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { dayparts, residencies, residencyContacts, residencyMemberships, users } from "@/db/schema";
import { selectResidencyMembership, type ResidencyMembershipOption } from "@/domain/residency-membership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { viewAsResidencyId } from "@/lib/view-as";

export const INTERNAL_TEST_RESIDENCY_COOKIE = "hfy_internal_test_residency";

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
  clientPaymentStatusVisible: boolean;
  accessRole: "manager" | "calendar_viewer";
  isViewAs: boolean;
  isInternalTest: boolean;
  availableResidencies: Array<Pick<ResidencyMembershipOption, "residencyId" | "residencyName" | "accessRole">>;
  needsDaypartRateAttention?: boolean;
};

export type AuditActor = InternalActor | ResidencyActor;

export class ResidencyAccessError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "ResidencyAccessError";
  }
}

export function isResidencyAccessError(error: unknown): error is ResidencyAccessError {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as Partial<ResidencyAccessError>;
  return candidate.name === "ResidencyAccessError"
    && candidate.status !== undefined
    && [401, 403].includes(candidate.status);
}

const currentProfile = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const [profile] = await getDb().select().from(users).where(and(eq(users.id, data.user.id), eq(users.active, true))).limit(1);
  if (!profile) return null;
  return { authUser: data.user, profile };
});

function clientManagedDaypartRateAttention() {
  return sql<boolean>`exists (
    select 1 from ${dayparts}
    where ${dayparts.residencyId} = ${residencies.id}
      and ${dayparts.active} = true
      and ${dayparts.type} = 'dj_artist'
      and ${dayparts.billingMode} = 'tracking_only'
      and coalesce(${dayparts.clientDefaultRateCents}, 0) <= 0
  )`;
}

function clientManagedDaypartRateAttentionCondition() {
  return and(
    eq(dayparts.active, true),
    eq(dayparts.type, "dj_artist"),
    eq(dayparts.billingMode, "tracking_only"),
    sql`coalesce(${dayparts.clientDefaultRateCents}, 0) <= 0`,
  );
}

const currentResidencyActor = cache(async (): Promise<ResidencyActor | null> => {
  const current = await currentProfile();
  if (!current) return null;
  if (current.profile.role === "internal_admin") {
    const selectedResidencyId = await viewAsResidencyId();
    if (!selectedResidencyId) return null;
    const [residency] = await getDb().select({
      residencyId: residencies.id,
      residencyName: residencies.name,
      residencyTimezone: residencies.timezone,
      clientPaymentStatusVisible: residencies.clientPaymentStatusVisible,
      needsDaypartRateAttention: sql<boolean>`count(${dayparts.id}) > 0`,
    }).from(residencies)
      .leftJoin(dayparts, and(eq(dayparts.residencyId, residencies.id), clientManagedDaypartRateAttentionCondition()))
      .where(and(
        eq(residencies.id, selectedResidencyId),
        eq(residencies.operatingMode, "operations"),
      ))
      .groupBy(residencies.id)
      .limit(1);
    if (!residency) return null;
    return {
      kind: "residency",
      userId: current.profile.id,
      email: current.profile.email,
      displayName: current.profile.displayName,
      ...residency,
      accessRole: "manager",
      isViewAs: true,
      isInternalTest: false,
      availableResidencies: [],
    };
  }
  if (current.profile.role !== "hotel_user") return null;
  const membershipQuery = getDb().select({
    residencyId: residencyMemberships.residencyId,
    residencyName: residencies.name,
    residencyTimezone: residencies.timezone,
    clientPaymentStatusVisible: residencies.clientPaymentStatusVisible,
    accessRole: residencyMemberships.accessRole,
    contactId: residencyContacts.id,
    invitationStatus: residencyContacts.invitationStatus,
    needsDaypartRateAttention: clientManagedDaypartRateAttention(),
  }).from(residencyMemberships)
    .innerJoin(residencies, eq(residencyMemberships.residencyId, residencies.id))
    .leftJoin(residencyContacts, and(
      eq(residencyContacts.userId, current.profile.id),
      eq(residencyContacts.residencyId, residencyMemberships.residencyId),
      eq(residencyContacts.active, true),
    ))
    .where(and(
      eq(residencyMemberships.userId, current.profile.id),
      eq(residencyMemberships.active, true),
      eq(residencies.active, true),
      eq(residencies.operatingMode, "operations"),
    ))
    .orderBy(asc(residencies.name));
  const memberships = current.profile.isInternalTest ? await membershipQuery : await membershipQuery.limit(1);
  const selectedResidencyId = current.profile.isInternalTest
    ? (await cookies()).get(INTERNAL_TEST_RESIDENCY_COOKIE)?.value
    : undefined;
  const membership = selectResidencyMembership(memberships, selectedResidencyId, current.profile.isInternalTest);
  if (!membership) return null;
  if (membership.contactId && membership.invitationStatus !== "active") {
    await getDb().update(residencyContacts).set({ invitationStatus: "active", acceptedAt: new Date(), updatedAt: new Date() }).where(and(
      eq(residencyContacts.id, membership.contactId),
      ne(residencyContacts.invitationStatus, "active"),
    ));
  }
  return {
    kind: "residency",
    userId: current.profile.id,
    email: current.profile.email,
    displayName: current.profile.displayName,
    residencyId: membership.residencyId,
    residencyName: membership.residencyName,
    residencyTimezone: membership.residencyTimezone,
    clientPaymentStatusVisible: membership.clientPaymentStatusVisible,
    accessRole: membership.accessRole,
    isViewAs: false,
    isInternalTest: current.profile.isInternalTest,
    needsDaypartRateAttention: membership.needsDaypartRateAttention,
    availableResidencies: current.profile.isInternalTest
      ? memberships.map(({ residencyId, residencyName, accessRole }) => ({ residencyId, residencyName, accessRole }))
      : [],
  };
});

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
  const actor = await currentResidencyActor();
  if (!actor) redirect("/login");
  return actor;
}

export async function requireActorForResidency(
  residencyId: string,
  options: { manager?: boolean } = {},
): Promise<AuditActor> {
  const current = await currentProfile();
  if (!current) throw new ResidencyAccessError(401, "Sign in to continue.");
  if (current.profile.role === "internal_admin") {
    if (await viewAsResidencyId() === residencyId) {
      const previewActor = await currentResidencyActor();
      if (previewActor?.residencyId === residencyId) return previewActor;
    }
    return {
      kind: "internal",
      userId: current.profile.id,
      email: current.profile.email,
      displayName: current.profile.displayName,
    };
  }
  if (current.profile.role !== "hotel_user") throw new ResidencyAccessError(403, "This account cannot access a Residency.");
  const [membership] = await getDb().select({
    residencyId: residencyMemberships.residencyId,
    residencyName: residencies.name,
    residencyTimezone: residencies.timezone,
    clientPaymentStatusVisible: residencies.clientPaymentStatusVisible,
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
  if (!membership) throw new ResidencyAccessError(403, "You do not have access to this Residency.");
  if (options.manager && membership.accessRole !== "manager") {
    throw new ResidencyAccessError(403, "Manager access is required for this change.");
  }
  return {
    kind: "residency",
    userId: current.profile.id,
    email: current.profile.email,
    displayName: current.profile.displayName,
    residencyId: membership.residencyId,
    residencyName: membership.residencyName,
    residencyTimezone: membership.residencyTimezone,
    clientPaymentStatusVisible: membership.clientPaymentStatusVisible,
    accessRole: membership.accessRole,
    isViewAs: false,
    isInternalTest: current.profile.isInternalTest,
    availableResidencies: [],
  };
}

export async function getSignedInDestination(): Promise<"/app" | "/residency" | "/login"> {
  const current = await currentProfile();
  if (!current) return "/login";
  return current.profile.role === "internal_admin" ? "/app" : "/residency";
}
