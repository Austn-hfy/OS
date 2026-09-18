"use client";

import { useActionState } from "react";
import { ResidencySectionHeader, ResidencySurfaceCard } from "@/components/residency-design-system";
import { updateResidencyClientSettingsAction, type ClientSettingsActionState } from "../actions";

type Settings = {
  name: string;
  cityState: string;
  timezone: string;
};

const initialState: ClientSettingsActionState = { status: "idle", message: "" };

export function ResidencySettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState(updateResidencyClientSettingsAction, initialState);
  return <form action={action} className="card residency-client-settings-form">
    <ResidencySurfaceCard className="settings-account-section"><ResidencySectionHeader eyebrow="Account" title="Residency details" description="Basic information used throughout this Residency workspace." /><div className="settings-fields"><div className="field"><label>Residency name</label><input name="name" defaultValue={settings.name} required /></div><div className="field"><label>City / State</label><input name="cityState" defaultValue={settings.cityState} placeholder="Palm Springs, CA" /></div><div className="field wide"><label>Timezone</label><input name="timezone" defaultValue={settings.timezone} required /></div></div></ResidencySurfaceCard>
    {state.status !== "idle" ? <p className={state.status === "error" ? "error" : "success"} aria-live="polite">{state.message}</p> : null}
    <footer><span>These details identify the Residency throughout HFY OS.</span><button className="button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save Settings"}</button></footer>
  </form>;
}
