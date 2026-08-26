import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="login-shell">
      <section className="login-art">
        <div className="brand">
          <span className="brand-mark">HFY</span>
          <span className="brand-copy"><strong>HEAR FOR YOU</strong><span>Residency operations</span></span>
        </div>
        <div>
          <p className="eyebrow">Programming, without the scramble</p>
          <h1>One rhythm.<br />Every residency.</h1>
          <p>Calendar, talent, payouts, and billing stay in one operating workspace for every residency.</p>
        </div>
      </section>
      <section className="login-panel">
        <LoginForm />
      </section>
    </main>
  );
}
