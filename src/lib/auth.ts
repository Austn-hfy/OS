import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type InternalActor = {
  kind: "internal";
  userId: string;
  email: string;
  displayName: string;
};

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

export async function getSignedInDestination(): Promise<"/app" | "/login"> {
  const current = await currentProfile();
  if (!current) return "/login";
  return current.profile.role === "internal_admin" ? "/app" : "/login";
}
