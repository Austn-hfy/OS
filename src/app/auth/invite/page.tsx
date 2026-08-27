"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function InviteAcceptPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Securing your invitation…");
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const finish = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) router.replace("/reset-password");
      else setMessage("This invitation could not be verified. Ask HFY to send a new invitation.");
    };
    const timer = window.setTimeout(finish, 500);
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace("/reset-password");
    });
    return () => { window.clearTimeout(timer); subscription.subscription.unsubscribe(); };
  }, [router]);
  return <main className="login-shell"><section className="login-art"><div className="brand"><span className="brand-mark">HFY</span><span className="brand-copy"><strong>HFY OS</strong><span>Residency operations</span></span></div><div><p className="eyebrow">Private invitation</p><h1>Welcome to HFY.</h1><p>Your Residency calendar is being prepared.</p></div></section><section className="login-panel"><div className="login-card"><p>{message}</p></div></section></main>;
}
