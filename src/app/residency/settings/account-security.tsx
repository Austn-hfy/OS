"use client";

import { useActionState, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ResidencySectionHeader, ResidencySurfaceCard } from "@/components/residency-design-system";
import { requestOwnEmailChangeAction, type AccountActionState } from "./actions";

const initialState: AccountActionState = { status: "idle", message: "" };

export function AccountSecurity({ email }: { email: string }) {
  const [emailState, emailAction, emailPending] = useActionState(requestOwnEmailChangeAction, initialState);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordPending, setPasswordPending] = useState(false);

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage("");
    const data = new FormData(event.currentTarget);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("confirmation") ?? "");
    if (password.length < 12) return setPasswordMessage("Use at least 12 characters for the new password.");
    if (password !== confirmation) return setPasswordMessage("The new passwords do not match.");
    setPasswordPending(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password, current_password: currentPassword });
    setPasswordPending(false);
    if (error) return setPasswordMessage(error.message);
    event.currentTarget.reset();
    setPasswordMessage("Password updated.");
  }

  return <ResidencySurfaceCard className="settings-account-section account-security-card">
    <ResidencySectionHeader eyebrow="Your login" title="Email & password" description="These changes affect only your own HFY OS sign-in." />
    <div className="account-security-grid">
      <form action={emailAction}><div className="field"><label htmlFor="account-email">Login email</label><input id="account-email" name="email" type="email" autoComplete="email" defaultValue={email} required /></div>{emailState.status !== "idle" ? <p className={emailState.status === "error" ? "error" : "success"}>{emailState.message}</p> : null}<button className="button secondary" type="submit" disabled={emailPending}>{emailPending ? "Sending confirmation…" : "Update email"}</button></form>
      <form onSubmit={changePassword}><div className="field"><label htmlFor="current-password">Current password</label><input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required /></div><div className="field"><label htmlFor="new-password">New password</label><input id="new-password" name="password" type="password" autoComplete="new-password" minLength={12} required /></div><div className="field"><label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" name="confirmation" type="password" autoComplete="new-password" minLength={12} required /></div>{passwordMessage ? <p className={passwordMessage === "Password updated." ? "success" : "error"}>{passwordMessage}</p> : null}<button className="button secondary" type="submit" disabled={passwordPending}>{passwordPending ? "Updating…" : "Change password"}</button></form>
    </div>
  </ResidencySurfaceCard>;
}

