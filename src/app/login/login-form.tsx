"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { passwordRecoveryRedirectUrl } from "@/lib/auth-redirect";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "recovery">("sign-in");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    const data = new FormData(event.currentTarget);
    try {
      const supabase = createSupabaseBrowserClient();
      if (mode === "recovery") {
        const result = await supabase.auth.resetPasswordForEmail(String(data.get("email") ?? ""), {
          redirectTo: passwordRecoveryRedirectUrl(window.location.origin),
        });
        if (result.error) throw result.error;
        setMessage("Check your email for a secure password-reset link. You can close this page after it arrives.");
        setLoading(false);
        return;
      }
      const result = await supabase.auth.signInWithPassword({
        email: String(data.get("email") ?? ""),
        password: String(data.get("password") ?? ""),
      });
      if (result.error) throw result.error;
      router.replace("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in.");
      setLoading(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <div>
        <p className="eyebrow">Private access</p>
        <h2>{mode === "sign-in" ? "Sign in" : "Reset password"}</h2>
        <p className="subhead">
          {mode === "sign-in"
            ? "Use the login HFY created for you."
            : "Enter your account email and we’ll send you a secure reset link."}
        </p>
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      {mode === "sign-in" ? (
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="success">{message}</p> : null}
      <button className="button lime" disabled={loading} type="submit">
        {loading
          ? mode === "sign-in" ? "Signing in…" : "Sending link…"
          : mode === "sign-in" ? "Sign in to HFY OS" : "Send reset link"}
      </button>
      <button
        className="login-mode-switch"
        disabled={loading}
        type="button"
        onClick={() => {
          setMode((current) => current === "sign-in" ? "recovery" : "sign-in");
          setError("");
          setMessage("");
        }}
      >
        {mode === "sign-in" ? "Forgot your password?" : "Back to sign in"}
      </button>
    </form>
  );
}
