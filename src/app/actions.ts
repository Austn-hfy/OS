"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { INTERNAL_TEST_RESIDENCY_COOKIE, requireActorForResidency } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  (await cookies()).delete(INTERNAL_TEST_RESIDENCY_COOKIE);
  redirect("/login");
}

export async function switchInternalTestResidency(formData: FormData) {
  const residencyId = z.uuid().parse(formData.get("residencyId"));
  const actor = await requireActorForResidency(residencyId);
  if (actor.kind !== "residency" || !actor.isInternalTest) throw new Error("This account cannot switch Residencies.");
  (await cookies()).set(INTERNAL_TEST_RESIDENCY_COOKIE, residencyId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 180,
    path: "/residency",
    priority: "high",
  });
  redirect("/residency/calendar");
}
