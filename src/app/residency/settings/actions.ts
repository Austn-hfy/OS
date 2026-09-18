"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditLog } from "@/db/schema";
import { getDb } from "@/db/client";
import { requireResidencyActorForMutation } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { changeResidencyUserRole, inviteResidencyUsers, removeResidencyUser, requestResidencyUserPasswordReset, resendResidencyInvitation, setPrimaryResidencyContact } from "@/services/residency-users";

export type AccountActionState = { status: "idle" | "success" | "error"; message: string };

function refreshAccount() {
  revalidatePath("/residency/settings");
}

export async function inviteResidencyUsersAction(_state: AccountActionState, formData: FormData): Promise<AccountActionState> {
  try {
    const actor = await requireResidencyActorForMutation();
    const role = z.enum(["manager", "calendar_viewer"]).default("calendar_viewer").parse(formData.get("role") || "calendar_viewer");
    const raw = z.string().min(1).max(2_000).parse(formData.get("emails"));
    const emails = raw.split(/[\n,]+/).map((value) => value.trim()).filter(Boolean);
    const parsedEmails = z.array(z.email()).min(1).max(4).parse(emails);
    const result = await inviteResidencyUsers(actor, parsedEmails, role);
    refreshAccount();
    return { status: "success", message: `${result.invited} user invitation${result.invited === 1 ? "" : "s"} processed.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to invite these users." };
  }
}

export async function changeResidencyUserRoleAction(formData: FormData) {
  const actor = await requireResidencyActorForMutation();
  const parsed = z.object({ contactId: z.uuid(), role: z.enum(["manager", "calendar_viewer"]) }).parse(Object.fromEntries(formData));
  await changeResidencyUserRole(actor, parsed.contactId, parsed.role);
  refreshAccount();
}

export async function resendResidencyInvitationAction(formData: FormData) {
  const actor = await requireResidencyActorForMutation();
  const contactId = z.uuid().parse(formData.get("contactId"));
  await resendResidencyInvitation(actor, contactId);
  refreshAccount();
}

export async function requestResidencyUserPasswordResetAction(formData: FormData) {
  const actor = await requireResidencyActorForMutation();
  const contactId = z.uuid().parse(formData.get("contactId"));
  await requestResidencyUserPasswordReset(actor, contactId);
}

export async function removeResidencyUserAction(formData: FormData) {
  const actor = await requireResidencyActorForMutation();
  const contactId = z.uuid().parse(formData.get("contactId"));
  await removeResidencyUser(actor, contactId);
  refreshAccount();
}

export async function setPrimaryResidencyContactAction(formData: FormData) {
  const actor = await requireResidencyActorForMutation();
  const contactId = z.uuid().parse(formData.get("contactId"));
  await setPrimaryResidencyContact(actor, contactId);
  refreshAccount();
}

export async function requestOwnEmailChangeAction(_state: AccountActionState, formData: FormData): Promise<AccountActionState> {
  try {
    const actor = await requireResidencyActorForMutation();
    const email = z.email().parse(String(formData.get("email") ?? "").trim().toLocaleLowerCase());
    if (email === actor.email.toLocaleLowerCase()) return { status: "success", message: "That is already your login email." };
    const supabase = await createSupabaseServerClient();
    const callback = new URL("/auth/callback", process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://hfy.app");
    callback.searchParams.set("next", "/residency/settings?email=confirmed");
    const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: callback.toString() });
    if (error) throw error;
    await getDb().insert(auditLog).values({
      residencyId: actor.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "residency_user_email_change_requested",
      entityType: "user",
      entityId: actor.userId,
      details: { newEmail: email },
    });
    return { status: "success", message: `Confirmation instructions were sent for ${email}. Your login stays unchanged until the new address is confirmed.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to request this email change." };
  }
}
