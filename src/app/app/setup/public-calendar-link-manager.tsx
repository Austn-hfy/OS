"use client";

import { useActionState, useState } from "react";
import { rotatePublicCalendarLinkAction, type PublicCalendarLinkActionState } from "../actions";

const initialState: PublicCalendarLinkActionState = { status: "idle", message: "" };

export function PublicCalendarLinkManager({ residencyId, hasLink }: { residencyId: string; hasLink: boolean }) {
  const [state, action, pending] = useActionState(rotatePublicCalendarLinkAction, initialState);
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!state.url) return;
    await navigator.clipboard.writeText(state.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return <article className="card residency-setup-card public-calendar-link-card">
    <div><p className="eyebrow">Calendar sharing</p><h2>Public calendar link</h2><p className="subhead">A read-only link for trusted partners. It exposes only Instagram handles and scheduled date/time.</p></div>
    <div className="public-calendar-boundary"><strong>{hasLink || state.status === "success" ? "An active link exists" : "No public link yet"}</strong><span>The token never expires. Regenerating it immediately revokes the previous link.</span></div>
    {state.url ? <div className="public-calendar-copy"><label htmlFor="public-calendar-url">New link</label><div><input id="public-calendar-url" readOnly value={state.url} /><button className="button secondary" type="button" onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</button></div><small>Copy this now. HFY OS stores only a one-way hash and cannot reveal this exact token again.</small></div> : null}
    {state.message ? <p className={state.status === "error" ? "error" : "success"} aria-live="polite">{state.message}</p> : null}
    <form action={action}><input name="residencyId" type="hidden" value={residencyId} /><button className={hasLink || state.status === "success" ? "button secondary" : "button"} disabled={pending} type="submit">{pending ? "Creating…" : hasLink || state.status === "success" ? "Regenerate link" : "Create public link"}</button></form>
  </article>;
}
