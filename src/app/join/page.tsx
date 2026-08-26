import { OnboardingForm } from "./onboarding-form";

export default function TalentOnboardingPage() {
  return (
    <main className="login-shell">
      <section className="login-art">
        <div className="brand"><span className="brand-mark">HFY</span><span className="brand-copy"><strong>HEAR FOR YOU</strong><span>Talent network</span></span></div>
        <div><p className="eyebrow">Artist onboarding</p><h1>Let’s work<br />together.</h1><p>Share your booking and payment details securely. Your submission goes to HFY for review and is never visible to hotel users.</p></div>
      </section>
      <section className="login-panel"><div style={{ width: "min(620px, 100%)" }}><OnboardingForm /></div></section>
    </main>
  );
}
