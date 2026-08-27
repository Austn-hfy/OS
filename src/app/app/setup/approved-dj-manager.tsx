"use client";

import { useActionState, useMemo, useState } from "react";
import { updateResidencyApprovedTalentAction, type ResidencyActionState } from "@/app/app/actions";

type ArtistOption = { id: string; stageName: string; homeMarket: string };

const initialState: ResidencyActionState = { status: "idle", message: "" };

export function ApprovedDjManager({
  residencyId,
  artists,
  approvedTalentIds,
}: {
  residencyId: string;
  artists: ArtistOption[];
  approvedTalentIds: string[];
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set(approvedTalentIds));
  const [state, action, pending] = useActionState(updateResidencyApprovedTalentAction, initialState);
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized
      ? artists.filter((artist) => `${artist.stageName} ${artist.homeMarket}`.toLocaleLowerCase().includes(normalized))
      : artists;
  }, [artists, query]);
  const payload = JSON.stringify({ residencyId, talentIds: [...selected] });

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return <form action={action} className="card approved-dj-manager">
    <input name="payload" type="hidden" value={payload} />
    <div className="setup-card-heading">
      <div><p className="eyebrow">Approved DJs</p><h2>Residency artist list</h2><p className="subhead">Checked artists are available when scheduling this Residency. Existing bookings are never removed.</p></div>
      <strong>{selected.size} approved</strong>
    </div>
    <label className="approved-dj-search"><span>Search artists</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Artist name or market" /></label>
    <div className="approved-dj-list">
      {visible.map((artist) => <label className="approved-dj-row" key={artist.id}>
        <input type="checkbox" checked={selected.has(artist.id)} onChange={() => toggle(artist.id)} />
        <span><strong>{artist.stageName}</strong><small>{artist.homeMarket || "Market not set"}</small></span>
      </label>)}
      {!visible.length ? <p className="empty">No active artists match this search.</p> : null}
    </div>
    {state.status !== "idle" ? <p className={state.status === "error" ? "error" : "success"} aria-live="polite">{state.message}</p> : null}
    <div className="setup-card-actions"><span>Only active artists can be approved.</span><button className="button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save approved DJs"}</button></div>
  </form>;
}
