"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type SetupResponse = { status?: "success"; email?: string; error?: string };

export function AccountSetupForm() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token")?.trim() || "";
    if (!token) {
      setError("This setup link is missing its secure token. Ask HFY for a new link.");
      return;
    }
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("confirmation") ?? "");
    if (password.length < 12) {
      setError("Use at least 12 characters for your password.");
      return;
    }
    if (password !== confirmation) {
      setError("The two passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/setup-account", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmation }),
      });
      const result = await response.json() as SetupResponse;
      if (!response.ok || result.status !== "success" || !result.email) {
        setError(result.error ?? "HFY OS could not complete account setup.");
        setLoading(false);
        return;
      }

      window.history.replaceState(null, "", "/setup-account");
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: result.email, password });
      if (signInError) {
        window.location.replace("/login?setup=success");
        return;
      }
      window.location.replace("/app");
    } catch {
      setError("HFY OS could not reach the secure setup service. Your link has not been used; try again.");
      setLoading(false);
    }
  }

  return <form className="login-form" onSubmit={submit}>
    <div>
      <p className="eyebrow">Account setup</p>
      <h2>Choose your password</h2>
      <p className="subhead">Opening or refreshing this page does not use the link. It is used only after your password saves successfully.</p>
    </div>
    <div className="field">
      <label htmlFor="password">New password</label>
      <input id="password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={200} required />
    </div>
    <div className="field">
      <label htmlFor="confirmation">Confirm new password</label>
      <input id="confirmation" name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={200} required />
    </div>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <button className="button lime" disabled={loading} type="submit">{loading ? "Saving securely…" : "Save password and enter HFY OS"}</button>
  </form>;
}
