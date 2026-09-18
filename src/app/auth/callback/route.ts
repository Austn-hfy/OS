import { NextResponse } from "next/server";
import { safeAuthRedirect } from "@/lib/auth-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLog, residencies, residencyContacts, users } from "@/db/schema";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeAuthRedirect(requestUrl.searchParams.get("next"), "/reset-password");

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data } = await supabase.auth.getUser();
      const authUser = data.user;
      const confirmedEmail = authUser?.email?.trim().toLocaleLowerCase();
      if (authUser && confirmedEmail) {
        const [localUser] = await getDb().select({ email: users.email }).from(users).where(eq(users.id, authUser.id)).limit(1);
        if (localUser && localUser.email.toLocaleLowerCase() !== confirmedEmail) {
          const contacts = await getDb().select({ id: residencyContacts.id, residencyId: residencyContacts.residencyId, isPrimary: residencyContacts.isPrimary })
            .from(residencyContacts).where(eq(residencyContacts.userId, authUser.id));
          await getDb().transaction(async (tx) => {
            await tx.update(users).set({ email: confirmedEmail, updatedAt: new Date() }).where(eq(users.id, authUser.id));
            await tx.update(residencyContacts).set({ email: confirmedEmail, updatedAt: new Date() }).where(eq(residencyContacts.userId, authUser.id));
            for (const contact of contacts) {
              if (contact.isPrimary) await tx.update(residencies).set({ primaryContactEmail: confirmedEmail, updatedAt: new Date() }).where(eq(residencies.id, contact.residencyId));
              await tx.insert(auditLog).values({
                residencyId: contact.residencyId,
                actorUserId: authUser.id,
                actorLabel: confirmedEmail,
                action: "residency_user_email_changed",
                entityType: "user",
                entityId: authUser.id,
                details: { previousEmail: localUser.email, newEmail: confirmedEmail },
              });
            }
          });
        }
      }
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  }

  return NextResponse.redirect(new URL("/reset-password?error=expired", requestUrl.origin));
}
