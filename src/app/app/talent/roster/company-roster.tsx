"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateArtistRosterPlacementAction, type ResidencyActionState } from "@/app/app/actions";
import type { getCompanyRosterData } from "@/data/internal";

type RosterData = Awaited<ReturnType<typeof getCompanyRosterData>>;

export function CompanyRoster({ artists, residencies }: RosterData) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [residencyFilter, setResidencyFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedResidencies, setSelectedResidencies] = useState<Set<string>>(new Set());
  const [eligibility, setEligibility] = useState("shared");
  const [state, setState] = useState<ResidencyActionState>({ status: "idle", message: "" });
  const [pending, startTransition] = useTransition();
  const editingArtist = artists.find((artist) => artist.id === editingId) ?? null;

  const visibleArtists = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return artists.filter((artist) => (
      !normalized
      || artist.stageName.toLowerCase().includes(normalized)
      || artist.homeMarket.toLowerCase().includes(normalized)
      || artist.instagramHandle.toLowerCase().includes(normalized)
      || artist.genres.some((genre) => genre.toLowerCase().includes(normalized))
    )).filter((artist) => residencyFilter === "all"
      || residencyFilter === "unassigned" && artist.assignedResidencies.length === 0
      || artist.assignedResidencies.some((residency) => residency.id === residencyFilter));
  }, [artists, query, residencyFilter]);

  function openEditor(artist: RosterData["artists"][number]) {
    setEditingId(artist.id);
    setSelectedResidencies(new Set(artist.assignedResidencies.map((residency) => residency.id)));
    setEligibility(artist.exclusiveResidencyId ?? "shared");
    setState({ status: "idle", message: "" });
  }

  function save() {
    if (!editingArtist) return;
    startTransition(async () => {
      const exclusiveResidencyId = eligibility === "shared" ? null : eligibility;
      const residencyIds = exclusiveResidencyId
        ? [...selectedResidencies].filter((id) => id === exclusiveResidencyId)
        : [...selectedResidencies];
      const result = await updateArtistRosterPlacementAction({ talentId: editingArtist.id, exclusiveResidencyId, residencyIds });
      setState(result);
      if (result.status === "success") {
        setEditingId(null);
        router.refresh();
      }
    });
  }

  return <section className="company-roster-card">
    <div className="company-roster-toolbar">
      <div className="field"><label htmlFor="company-roster-search">Search roster</label><input id="company-roster-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, genre, market, or Instagram" /></div>
      <div className="field"><label htmlFor="company-roster-residency">Residency assignment</label><select id="company-roster-residency" value={residencyFilter} onChange={(event) => setResidencyFilter(event.target.value)}><option value="all">All artists</option><option value="unassigned">Not assigned</option>{residencies.map((residency) => <option value={residency.id} key={residency.id}>{residency.name}</option>)}</select></div>
    </div>
    <div className="company-roster-summary"><strong>{visibleArtists.length}</strong> artist{visibleArtists.length === 1 ? "" : "s"}</div>
    <div className="company-roster-list">{visibleArtists.map((artist) => <article key={artist.id}>
      <div><strong>{artist.stageName}</strong><span>{artist.genres.join(" · ")}</span></div>
      <div><span>{artist.homeMarket || "Market not set"}</span><span>{artist.instagramHandle || "Instagram not set"}</span></div>
      <div><small>{artist.exclusiveResidencyId ? `Exclusive to ${residencies.find((residency) => residency.id === artist.exclusiveResidencyId)?.name ?? "Residency"}` : "Shared eligibility"}</small><div className="company-roster-chips">{artist.assignedResidencies.length ? artist.assignedResidencies.map((residency) => <span key={residency.id}>{residency.name}</span>) : <em>Not assigned</em>}</div></div>
      <button className="button secondary" type="button" onClick={() => openEditor(artist)}>Manage</button>
    </article>)}{!visibleArtists.length ? <div className="empty">No artists match these filters.</div> : null}</div>

    {editingArtist ? <div className="artist-editor-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setEditingId(null); }}><aside className="artist-editor-drawer artist-residency-drawer" role="dialog" aria-modal="true" aria-labelledby="roster-assignment-title"><div className="artist-editor-form">
      <header className="artist-editor-heading"><div><p className="eyebrow">Roster placement</p><h2 id="roster-assignment-title">{editingArtist.stageName}</h2><p>Eligibility says where this artist may be assigned. Assignments control where the artist actually appears.</p></div><button className="quick-modal-close" type="button" aria-label="Close roster placement" onClick={() => setEditingId(null)}>×</button></header>
      <div className="artist-editor-scroll">
        <fieldset className="company-roster-eligibility"><legend>Eligibility</legend><label><input type="radio" name="eligibility" checked={eligibility === "shared"} onChange={() => setEligibility("shared")} /><span><strong>Shared</strong><small>May be assigned to multiple Residencies.</small></span></label>{residencies.map((residency) => <label key={residency.id}><input type="radio" name="eligibility" checked={eligibility === residency.id} onChange={() => { setEligibility(residency.id); setSelectedResidencies(new Set([residency.id])); }} /><span><strong>Exclusive to {residency.name}</strong><small>Automatically removes other Residency assignments.</small></span></label>)}</fieldset>
        <fieldset className="artist-residency-options"><legend>Explicit Residency assignments</legend>{residencies.map((residency) => { const blocked = eligibility !== "shared" && eligibility !== residency.id; return <label className={blocked ? "disabled" : ""} key={residency.id}><input type="checkbox" checked={selectedResidencies.has(residency.id)} disabled={blocked} onChange={() => setSelectedResidencies((current) => { const next = new Set(current); if (next.has(residency.id)) next.delete(residency.id); else next.add(residency.id); return next; })} /><span><strong>{residency.name}</strong><small>{blocked ? "Unavailable for this exclusive artist" : residency.cityState || "Location not set"}</small></span></label>; })}</fieldset>
        {state.status !== "idle" ? <p className={state.status === "error" ? "error" : "success"} aria-live="polite">{state.message}</p> : null}
      </div>
      <footer className="artist-editor-actions"><button className="button secondary" type="button" onClick={() => setEditingId(null)}>Cancel</button><button className="button" type="button" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save Placement"}</button></footer>
    </div></aside></div> : null}
  </section>;
}
