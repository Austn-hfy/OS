"use client";

import { useEffect, useState } from "react";
import { inviteCallbackUrl, inviteSessionTokensFromHash } from "@/lib/invite-auth";
import { createSupabaseInviteBrowserClient } from "@/lib/supabase/browser";

export default function InviteAcceptPage() {
  const [message, setMessage] = useState("Securing your invitation…");

  useEffect(() => {
    let active = true;

    const finish = async () => {
      const currentUrl = new URL(window.location.href);
      const code = currentUrl.searchParams.get("code");
      if (code) {
        window.location.replace(inviteCallbackUrl(currentUrl.origin, code));
        return;
      }

      const supabase = createSupabaseInviteBrowserClient();
      const inviteTokens = inviteSessionTokensFromHash(currentUrl.hash);
      if (inviteTokens) {
        const { data, error } = await supabase.auth.setSession(inviteTokens);
        if (!active) return;
        if (!error && data.session) {
          window.location.replace("/reset-password");
          return;
        }
      } else {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        if (data.session) {
          window.location.replace("/reset-password");
          return;
        }
      }

      setMessage("This invitation is expired or has already been used. Ask HFY to send a new invitation.");
    };

    void finish();
    return () => { active = false; };
  }, []);

  return <main className="login-shell"><section className="login-art"><div className="brand"><span className="brand-mark">HFY</span><span className="brand-copy"><strong>HFY OS</strong><span>Residency operations</span></span></div><div><p className="eyebrow">Private invitation</p><h1>Welcome to HFY.</h1><p>Your Residency calendar is being prepared.</p></div></section><section className="login-panel"><div className="login-card"><p>{message}</p></div></section></main>;
}
