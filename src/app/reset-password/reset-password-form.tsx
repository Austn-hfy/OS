"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ResetPasswordForm({ ready }: { ready: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("confirmation") ?? "");

    if (password.length < 12) {
      setError("Use at least 12 characters for your new password.");
      return;
    }
    if (password !== confirmation) {
      setError("The two passwords do not match.");
      return;
    }

    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  if (!ready) {
    return (
      <div className="login-form">
        <div>
          <p className="eyebrow">Reset link unavailable</p>
          <h2>Request a new link</h2>
          <p className="subhead">This reset link is missing, expired, or has already been used.</p>
        </div>
        <Link className="button lime" href="/login">Return to sign in</Link>
      </div>
    );
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <div>
        <p className="eyebrow">Account recovery</p>
        <h2>Choose a password</h2>
        <p className="subhead">Use at least 12 characters. Your password stays private.</p>
      </div>
      <div className="field">
        <label htmlFor="password">New password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required />
      </div>
      <div className="field">
        <label htmlFor="confirmation">Confirm new password</label>
        <input id="confirmation" name="confirmation" type="password" autoComplete="new-password" minLength={12} required />
      </div>
      {error ? <p className="error">{error}</p> : null}
      <button className="button lime" disabled={loading} type="submit">
        {loading ? "Saving…" : "Save password and enter HFY OS"}
      </button>
    </form>
  );
}
