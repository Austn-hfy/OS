"use client";

import { useActionState } from "react";
import { saveCommittedPlanAction, type PlatformPlanActionState } from "./actions";

const initialState: PlatformPlanActionState = { status: "idle", message: "" };

export type CommittedPlanFormValue = {
  term: "month_to_month" | "annual";
  talentBucketSize: number;
  houseBucketSize: number;
  startsOn: string;
  renewsOn: string;
};

export function CommittedPlanForm({
  residencyId,
  residencyName,
  value,
  comped = false,
}: {
  residencyId: string;
  residencyName: string;
  value: CommittedPlanFormValue;
  comped?: boolean;
}) {
  const [state, action, pending] = useActionState(saveCommittedPlanAction, initialState);
  return <form action={action} className="platform-plan-form">
    <input type="hidden" name="residencyId" value={residencyId} />
    <div className="platform-plan-form-grid">
      <div className="field">
        <label htmlFor={`${residencyId}-talent-bucket`}>Talent capacity</label>
        <select id={`${residencyId}-talent-bucket`} name="talentBucketSize" defaultValue={value.talentBucketSize} required>
          {[10, 20, 30, 40, 50, 60].map((size) => <option key={size} value={size}>{size} slots</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${residencyId}-house-bucket`}>House capacity</label>
        <select id={`${residencyId}-house-bucket`} name="houseBucketSize" defaultValue={value.houseBucketSize} required>
          {[5, 10, 15].map((size) => <option key={size} value={size}>{size} slots{size === 5 ? " · minimum" : ""}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${residencyId}-term`}>Billing term</label>
        <select id={`${residencyId}-term`} name="term" defaultValue={value.term}>
          <option value="month_to_month">Month-to-month</option>
          <option value="annual">Annual · 25% off, paid upfront</option>
        </select>
      </div>
      <div className="platform-plan-rate-summary">
        <span>{comped ? "Permanently comped" : "HFYOS v14 pricing"}</span>
        <strong>{comped ? "$0 billed" : "$30 per slot"}</strong>
        <small>{comped ? "Capacities stay stored for usage comparison" : "Same flat rate for Talent and House"}</small>
      </div>
      <div className="field"><label htmlFor={`${residencyId}-starts`}>Plan starts</label><input id={`${residencyId}-starts`} name="startsOn" type="date" defaultValue={value.startsOn} required /></div>
      <div className="field"><label htmlFor={`${residencyId}-renews`}>Next renewal</label><input id={`${residencyId}-renews`} name="renewsOn" type="date" defaultValue={value.renewsOn} required /></div>
      <div className="field platform-plan-reason"><label htmlFor={`${residencyId}-reason`}>Reason for manual change</label><input id={`${residencyId}-reason`} name="changeReason" type="text" minLength={3} maxLength={500} placeholder={`Confirmed capacity plan for ${residencyName}`} required /></div>
    </div>
    <p className="privacy-note">Saving changes only the Committed Plan. Live Usage never edits capacities, creates automatic overage charges, or restricts access.</p>
    {state.status !== "idle" ? <p className={state.status === "error" ? "error" : "success"} aria-live="polite">{state.message}</p> : null}
    <button className="button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save Committed Plan"}</button>
  </form>;
}
