"use server";

import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { residencies } from "@/db/schema";
import { requireInternalActor } from "@/lib/auth";
import { VIEW_AS_RESIDENCY_COOKIE, VIEW_AS_RETURN_MODE_COOKIE } from "@/lib/view-as";

export async function enterViewAsAction(formData: FormData) {
  await requireInternalActor();
  const residencyId = z.uuid().parse(formData.get("residencyId"));
  const [residency] = await getDb().select({ id: residencies.id }).from(residencies).where(and(
    eq(residencies.id, residencyId),
    eq(residencies.operatingMode, "operations"),
  )).limit(1);
  if (!residency) throw new Error("Residency not found.");
  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  } as const;
  cookieStore.set(VIEW_AS_RESIDENCY_COOKIE, residency.id, cookieOptions);
  cookieStore.set(VIEW_AS_RETURN_MODE_COOKIE, "developer", cookieOptions);
  redirect("/residency/calendar");
}

export async function exitViewAsAction() {
  await requireInternalActor();
  const cookieStore = await cookies();
  const returnMode = cookieStore.get(VIEW_AS_RETURN_MODE_COOKIE)?.value;
  cookieStore.delete(VIEW_AS_RESIDENCY_COOKIE);
  cookieStore.delete(VIEW_AS_RETURN_MODE_COOKIE);
  redirect(returnMode === "developer" ? "/app?mode=developer" : "/app?mode=hfy");
}
