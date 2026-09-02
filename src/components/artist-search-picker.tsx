"use client";

import { useMemo, useState } from "react";

export type ArtistSearchOption = {
  id: string;
  name: string;
  meta?: string;
};

export type CreateArtistResult =
  | { status: "success"; artist: ArtistSearchOption }
  | { status: "error"; message: string };

export function ArtistSearchPicker({
  artists,
  excludedIds = [],
  label = "Add DJ",
  resultActionLabel = "Select",
  initiallyOpen = false,
  collapsedEyebrow,
  collapsedDescription,
  onOpenChange,
  onCreateArtist,
  onSelect,
}: {
  artists: ArtistSearchOption[];
  excludedIds?: string[];
  label?: string;
  resultActionLabel?: string;
  initiallyOpen?: boolean;
  collapsedEyebrow?: string;
  collapsedDescription?: string;
  onOpenChange?: (open: boolean) => void;
  onCreateArtist?: (name: string) => Promise<CreateArtistResult>;
  onSelect: (artistId: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newArtistName, setNewArtistName] = useState("");
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState("");
  function changeOpen(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
  }
  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return artists.filter((artist) => {
      if (excludedIds.includes(artist.id)) return false;
      return !normalizedQuery || `${artist.name} ${artist.meta ?? ""}`.toLowerCase().includes(normalizedQuery);
    }).slice(0, 7);
  }, [artists, excludedIds, query]);

  async function chooseArtist(artistId: string) {
    setPendingId(artistId);
    try {
      await onSelect(artistId);
      changeOpen(false);
      setQuery("");
    } finally {
      setPendingId(null);
    }
  }

  function startCreating() {
    setNewArtistName(query.trim());
    setCreateError("");
    setCreating(true);
  }

  async function createArtist() {
    const name = newArtistName.trim();
    if (!onCreateArtist || !name || createPending) return;
    setCreatePending(true);
    setCreateError("");
    try {
      const result = await onCreateArtist(name);
      if (result.status === "error") {
        setCreateError(result.message);
        return;
      }
      await onSelect(result.artist.id);
      setCreating(false);
      setNewArtistName("");
      setQuery("");
      changeOpen(false);
    } finally {
      setCreatePending(false);
    }
  }

  if (!open) {
    return collapsedDescription ? <button className="artist-choice-option" type="button" onClick={() => changeOpen(true)}><span>{collapsedEyebrow}</span><strong>+ {label}</strong><small>{collapsedDescription}</small></button> : <button className="button secondary quick-add-dj" type="button" onClick={() => changeOpen(true)}>+ {label}</button>;
  }

  return (
    <div className="artist-picker">
      <div className="artist-picker-search">
        <div className="field">
          <label>Search DJs</label>
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (onCreateArtist && !results.length && query.trim()) startCreating();
            }}
            placeholder="Search by name, market, or genre"
          />
        </div>
        <button className="artist-picker-cancel" type="button" onClick={() => { changeOpen(false); setQuery(""); }}>Cancel</button>
      </div>
      <div className="artist-results" role="listbox" aria-label="Matching DJs">
        {results.map((artist) => (
          <button
            className="artist-result"
            type="button"
            role="option"
            aria-selected="false"
            disabled={pendingId !== null}
            onClick={() => chooseArtist(artist.id)}
            key={artist.id}
          >
            <span><strong>{artist.name}</strong>{artist.meta ? <small>{artist.meta}</small> : null}</span>
            <span>{pendingId === artist.id ? "Selecting…" : resultActionLabel}</span>
          </button>
        ))}
        {!results.length ? <p className="artist-results-empty">No matching DJs found.</p> : null}
      </div>
      {onCreateArtist ? creating ? <div className="artist-inline-create">
        <div><strong>Add a new DJ</strong><small>Create the roster entry here, then continue scheduling this slot.</small></div>
        <div className="artist-inline-create-fields"><div className="field"><label>DJ name</label><input autoFocus value={newArtistName} onChange={(event) => setNewArtistName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void createArtist(); } }} placeholder="Artist or stage name" maxLength={200} /></div><button className="button" type="button" disabled={createPending || !newArtistName.trim()} onClick={createArtist}>{createPending ? "Adding…" : "Add DJ"}</button><button className="button secondary" type="button" disabled={createPending} onClick={() => { setCreating(false); setCreateError(""); }}>Cancel</button></div>
        {createError ? <p className="error" aria-live="polite">{createError}</p> : null}
      </div> : <button className="artist-create-trigger" type="button" onClick={startCreating}>+ {query.trim() && !results.some((artist) => artist.name.toLowerCase() === query.trim().toLowerCase()) ? `Add “${query.trim()}” as a new DJ` : "Add a new DJ"}</button> : null}
    </div>
  );
}
