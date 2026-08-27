"use client";

import { useActionState } from "react";
import { updateResidencyRatesAction, type ResidencyActionState } from "@/app/app/actions";
import { SensitiveInput } from "@/components/privacy-mode";

const initialState: ResidencyActionState = { status: "idle", message: "" };

export function ResidencyRateEditor({
  residencyId,
  defaultTalentRateCents,
  clientHourlyRateCents,
}: {
  residencyId: string;
  defaultTalentRateCents: number;
  clientHourlyRateCents: number;
}) {
  const [state, action, pending] = useActionState(updateResidencyRatesAction, initialState);

  return <form action={action} className="card selection-form residency-rate-editor">
    <input name="residencyId" type="hidden" value={residencyId} />
    <div><p className="eyebrow">Default rates</p><h2>Talent and client</h2><p className="subhead">Fallback hourly rates for new calendar work.</p></div>
    <div className="residency-rate-fields">
      <div className="field"><label htmlFor="residency-default-talent-rate">Talent rate ($/hr)</label><SensitiveInput id="residency-default-talent-rate" name="defaultTalentRate" type="number" min="0" step="0.01" defaultValue={(defaultTalentRateCents / 100).toFixed(2)} required /><small>Used after Assignment and Daypart overrides.</small></div>
      <div className="field"><label htmlFor="residency-default-client-rate">Client rate ($/hr)</label><SensitiveInput id="residency-default-client-rate" name="clientHourlyRate" type="number" min="0" step="0.01" defaultValue={(clientHourlyRateCents / 100).toFixed(2)} required /><small>Used when a Shift has no client-rate override.</small></div>
    </div>
    <p className="privacy-note">Rate changes apply to new work only. Existing Assignment payouts and Shift billing amounts are never recalculated.</p>
    {state.status !== "idle" ? <p className={state.status === "error" ? "error" : "success"} aria-live="polite">{state.message}</p> : null}
    <button className="button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save default rates"}</button>
  </form>;
}
