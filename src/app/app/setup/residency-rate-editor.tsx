"use client";

import { useActionState } from "react";
import { updateResidencyTalentDefaultAction, type ResidencyActionState } from "@/app/app/actions";
import { SensitiveInput } from "@/components/privacy-mode";

const initialState: ResidencyActionState = { status: "idle", message: "" };

export function ResidencyRateEditor({
  residencyId,
  residencyName,
  timezone,
  defaultTalentRateCents,
}: {
  residencyId: string;
  residencyName: string;
  timezone: string;
  defaultTalentRateCents: number;
}) {
  const [state, action, pending] = useActionState(updateResidencyTalentDefaultAction, initialState);

  return <form action={action} className="card selection-form residency-rate-editor">
    <input name="residencyId" type="hidden" value={residencyId} />
    <div><p className="eyebrow">Residency default</p><h2>{residencyName}</h2><p className="subhead">{timezone}</p></div>
    <div className="field">
      <label htmlFor="residency-default-talent-rate">Talent rate ($/hr)</label>
      <SensitiveInput id="residency-default-talent-rate" name="defaultTalentRate" type="number" min="0" step="0.01" defaultValue={(defaultTalentRateCents / 100).toFixed(2)} required />
      <small>Used only when an Assignment and its Daypart do not define another rate.</small>
    </div>
    <p className="privacy-note">Changing this affects new Assignments only. Existing payout amounts are never recalculated.</p>
    {state.status !== "idle" ? <p className={state.status === "error" ? "error" : "success"} aria-live="polite">{state.message}</p> : null}
    <button className="button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save talent default"}</button>
  </form>;
}
