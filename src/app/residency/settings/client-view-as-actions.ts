"use server";

import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { residencyMemberships, users } from "@/db/schema";
import { CLIENT_VIEW_AS_MEMBERSHIP_COOKIE } from "@/lib/client-view-as";
import { requireResidencyActor } from "@/lib/auth";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/residency",
  maxAge: 60 * 60 * 2,
} as const;

export async function enterClientViewAsAction(formData: FormData) {
  const actor = await requireResidencyActor();
  if (actor.actualAccessRole !== "manager" || actor.isClientViewAs) throw new Error("Manager access is required.");
  const membershipId = z.uuid().parse(formData.get("membershipId"));
  const [membership] = await getDb().select({ id: residencyMemberships.id }).from(residencyMemberships)
    .innerJoin(users, eq(residencyMemberships.userId, users.id))
    .where(and(
      eq(residencyMemberships.id, membershipId),
      eq(residencyMemberships.residencyId, actor.residencyId),
      eq(residencyMemberships.active, true),
      eq(users.active, true),
    )).limit(1);
  if (!membership) throw new Error("This user is not active on the Residency.");
  (await cookies()).set(CLIENT_VIEW_AS_MEMBERSHIP_COOKIE, membership.id, cookieOptions);
  redirect("/residency/calendar");
}

export async function exitClientViewAsAction() {
  const actor = await requireResidencyActor();
  if (!actor.isClientViewAs) throw new Error("No client preview is active.");
  (await cookies()).delete(CLIENT_VIEW_AS_MEMBERSHIP_COOKIE);
  redirect("/residency/settings");
}

