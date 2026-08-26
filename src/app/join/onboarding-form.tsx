"use client";

import { useActionState } from "react";
import { submitTalentOnboarding, type OnboardingState } from "./actions";

export function OnboardingForm() {
  const initial: OnboardingState = { status: "idle", message: "" };
  const [state, action, pending] = useActionState(submitTalentOnboarding, initial);
  return (
    <form action={action} className="card selection-form">
      <div className="field"><label>Stage name</label><input name="stageName" required /></div>
      <div className="field"><label>Full legal name</label><input name="fullName" required /></div>
      <div className="row"><div className="field"><label>Email</label><input name="email" type="email" required /></div><div className="field"><label>Phone</label><input name="phone" type="tel" required /></div></div>
      <div className="row"><div className="field"><label>Instagram</label><input name="instagramHandle" placeholder="@handle" /></div><div className="field"><label>Home market</label><input name="homeMarket" placeholder="Los Angeles" /></div></div>
      <div className="field"><label>Genres, comma separated</label><input name="genres" /></div>
      <div className="field"><label>Anything HFY should know?</label><textarea name="notes" rows={4} /></div>
      <div className="field"><label>W-9 (private, optional for initial review)</label><input accept="application/pdf,image/jpeg,image/png" name="w9" type="file" /></div>
      <input aria-hidden="true" name="website" tabIndex={-1} autoComplete="off" style={{ position: "absolute", left: "-10000px" }} />
      {state.message ? <p className={state.status === "error" ? "error" : "success"}>{state.message}</p> : null}
      <button className="button lime" disabled={pending || state.status === "success"} type="submit">{pending ? "Submitting…" : "Submit to HFY"}</button>
    </form>
  );
}
