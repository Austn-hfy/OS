import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accountSetupTokens, auditLog, residencyContacts, users } from "@/db/schema";
import { hashAccountSetupToken } from "@/domain/account-setup";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type CompleteAccountSetupResult =
  | { status: "success"; email: string }
  | { status: "invalid" };

type CompleteAccountSetupDependencies = {
  consume: (tokenHash: string, password: string, now: Date) => Promise<{ email: string } | null>;
};

async function consumePersistedAccountSetupToken(tokenHash: string, password: string, now: Date) {
  return getDb().transaction(async (tx) => {
    const [setup] = await tx.update(accountSetupTokens)
      .set({ usedAt: now })
      .where(and(
        eq(accountSetupTokens.tokenHash, tokenHash),
        isNull(accountSetupTokens.usedAt),
        isNull(accountSetupTokens.revokedAt),
        gt(accountSetupTokens.expiresAt, now),
      ))
      .returning({
        id: accountSetupTokens.id,
        userId: accountSetupTokens.userId,
        residencyId: accountSetupTokens.residencyId,
        contactId: accountSetupTokens.contactId,
      });
    if (!setup) return null;

    const [account] = await tx.select({ email: users.email })
      .from(users)
      .where(and(eq(users.id, setup.userId), eq(users.active, true)))
      .limit(1);
    if (!account) throw new Error("This account is no longer active.");

    const admin = createSupabaseAdminClient();
    const { error } = await admin.auth.admin.updateUserById(setup.userId, {
      password,
      email_confirm: true,
    });
    if (error) throw error;

    // A legacy recovery link can create a session before a password is chosen.
    // Remove every old session before the browser signs in with the new password.
    await tx.execute(sql`DELETE FROM auth.sessions WHERE user_id = ${setup.userId}`);

    if (setup.contactId) {
      await tx.update(residencyContacts).set({
        invitationStatus: "active",
        acceptedAt: now,
        updatedAt: now,
      }).where(eq(residencyContacts.id, setup.contactId));
    }

    await tx.insert(auditLog).values({
      residencyId: setup.residencyId,
      actorUserId: setup.userId,
      actorLabel: account.email,
      action: "account_setup_completed",
      entityType: "user",
      entityId: setup.userId,
      details: { setupTokenId: setup.id },
    });

    return { email: account.email };
  });
}

export async function completeAccountSetup(
  input: { token: string; password: string },
  dependencies: CompleteAccountSetupDependencies = { consume: consumePersistedAccountSetupToken },
  now = new Date(),
): Promise<CompleteAccountSetupResult> {
  const token = input.token.trim();
  if (token.length < 32 || token.length > 256) return { status: "invalid" };
  const completed = await dependencies.consume(hashAccountSetupToken(token), input.password, now);
  return completed ? { status: "success", email: completed.email } : { status: "invalid" };
}
