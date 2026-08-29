import { AccountSetupForm } from "./setup-account-form";

export const dynamic = "force-dynamic";

export default function SetupAccountPage() {
  return (
    <main className="login-shell">
      <meta name="robots" content="noindex, nofollow, noarchive" />
      <meta name="referrer" content="no-referrer" />
      <section className="login-art">
        <div className="brand">
          <span className="brand-mark">HFY</span>
          <span className="brand-copy"><strong>HEAR FOR YOU</strong><span>Residency operations</span></span>
        </div>
        <div>
          <p className="eyebrow">Private account setup</p>
          <h1>Welcome to your Residency.</h1>
          <p>Choose a private password, then enter the calendar and tools HFY has prepared for you.</p>
        </div>
      </section>
      <section className="login-panel">
        <AccountSetupForm />
      </section>
    </main>
  );
}
