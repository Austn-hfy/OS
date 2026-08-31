"use client";

import { useActionState } from "react";
import { updateResidencyClientSettingsAction, type ClientSettingsActionState } from "../actions";

type Settings = {
  name: string;
  cityState: string;
  timezone: string;
  primaryContactName: string;
  primaryContactPhone: string;
  primaryContactEmail: string;
};

const initialState: ClientSettingsActionState = { status: "idle", message: "" };

export function ResidencySettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState(updateResidencyClientSettingsAction, initialState);
  return <form action={action} className="card residency-client-settings-form">
    <section><div><p className="eyebrow">Account</p><h2>Residency details</h2><p>Basic information used throughout this Residency workspace.</p></div><div className="settings-fields"><div className="field"><label>Residency name</label><input name="name" defaultValue={settings.name} required /></div><div className="field"><label>City / State</label><input name="cityState" defaultValue={settings.cityState} placeholder="Palm Springs, CA" /></div><div className="field wide"><label>Timezone</label><input name="timezone" defaultValue={settings.timezone} required /></div></div></section>
    <section><div><p className="eyebrow">Contact</p><h2>Primary contact</h2><p>The main person HFY should contact about this program.</p></div><div className="settings-fields"><div className="field"><label>Name</label><input name="primaryContactName" defaultValue={settings.primaryContactName} /></div><div className="field"><label>Phone</label><input name="primaryContactPhone" type="tel" defaultValue={settings.primaryContactPhone} /></div><div className="field wide"><label>Email</label><input name="primaryContactEmail" type="email" defaultValue={settings.primaryContactEmail} /></div></div></section>
    {state.status !== "idle" ? <p className={state.status === "error" ? "error" : "success"} aria-live="polite">{state.message}</p> : null}
    <footer><span>Additional users and permissions will be added separately.</span><button className="button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save Settings"}</button></footer>
  </form>;
}
