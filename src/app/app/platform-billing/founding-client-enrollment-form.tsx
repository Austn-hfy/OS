"use client";

import { useActionState } from "react";
import { enrollFoundingClientAction, type FoundingClientActionState } from "./actions";

const initialState: FoundingClientActionState = { status: "idle", message: "" };

export function FoundingClientEnrollmentForm({ residencyId }: { residencyId: string }) {
  const [state, action, pending] = useActionState(enrollFoundingClientAction, initialState);
  return <form action={action} className="platform-founding-enrollment">
    <input type="hidden" name="residencyId" value={residencyId} />
    <div><strong>Founding Client eligibility</strong><span>Enroll explicitly to start this Residency’s six-month $60 Talent / $60 House window.</span></div>
    <button className="button secondary" type="submit" disabled={pending}>{pending ? "Enrolling…" : "Enroll as Founding Client"}</button>
    {state.status !== "idle" ? <p className={state.status === "error" ? "error" : "success"} aria-live="polite">{state.message}</p> : null}
  </form>;
}
