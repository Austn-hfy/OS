"use client";

import { useActionState } from "react";
import { updateResidencyProfileAction, type ResidencyActionState } from "@/app/app/actions";

const initialState: ResidencyActionState = { status: "idle", message: "" };

export function ResidencyProfileEditor({ residency }: {
  residency: {
    id: string;
    name: string;
    cityState: string;
    timezone: string;
    tier: "operations_only" | "complete";
    internalNotes: string;
  };
}) {
  const [state, action, pending] = useActionState(updateResidencyProfileAction, initialState);
  return <form action={action} className="card residency-profile-editor">
    <input name="residencyId" type="hidden" value={residency.id} />
    <div><p className="eyebrow">Residency profile</p><h2>Program details</h2><p className="subhead">The operating identity and internal context for this Residency.</p></div>
    <div className="residency-profile-fields">
      <div className="field"><label htmlFor="residency-profile-name">Residency name</label><input id="residency-profile-name" name="name" defaultValue={residency.name} required /></div>
      <div className="field"><label htmlFor="residency-profile-location">City / State</label><input id="residency-profile-location" name="cityState" defaultValue={residency.cityState} placeholder="Palm Springs, CA" /></div>
      <div className="field"><label htmlFor="residency-profile-timezone">Timezone</label><input id="residency-profile-timezone" name="timezone" defaultValue={residency.timezone} required /></div>
      <div className="field"><label htmlFor="residency-profile-tier">Service tier</label><select id="residency-profile-tier" name="tier" defaultValue={residency.tier}><option value="operations_only">Platform</option><option value="complete">Full Programming</option></select></div>
      <div className="field wide"><label htmlFor="residency-profile-notes">Internal notes</label><textarea id="residency-profile-notes" name="internalNotes" rows={3} defaultValue={residency.internalNotes} placeholder="Operating context, client preferences, or internal reminders" /></div>
    </div>
    {state.status !== "idle" ? <p className={state.status === "error" ? "error" : "success"} aria-live="polite">{state.message}</p> : null}
    <button className="button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save Residency profile"}</button>
  </form>;
}
