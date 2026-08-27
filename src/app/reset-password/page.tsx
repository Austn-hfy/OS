import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-password-form";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, supabase] = await Promise.all([
    searchParams,
    createSupabaseServerClient(),
  ]);
  const { data } = await supabase.auth.getUser();
  const ready = Boolean(data.user) && !error;

  return (
    <main className="login-shell">
      <section className="login-art">
        <div className="brand">
          <span className="brand-mark">HFY</span>
          <span className="brand-copy"><strong>HEAR FOR YOU</strong><span>Residency operations</span></span>
        </div>
        <div>
          <p className="eyebrow">Secure account recovery</p>
          <h1>Back in rhythm.</h1>
          <p>Choose a new password, then return directly to your HFY OS workspace.</p>
        </div>
      </section>
      <section className="login-panel">
        <ResetPasswordForm ready={ready} />
      </section>
    </main>
  );
}
