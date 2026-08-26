"use client";

import { useMemo, useState } from "react";

export type ArtistSearchOption = {
  id: string;
  name: string;
  meta?: string;
};

export function ArtistSearchPicker({
  artists,
  excludedIds = [],
  label = "Add DJ",
  resultActionLabel = "Select",
  onSelect,
}: {
  artists: ArtistSearchOption[];
  excludedIds?: string[];
  label?: string;
  resultActionLabel?: string;
  onSelect: (artistId: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
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
      setOpen(false);
      setQuery("");
    } finally {
      setPendingId(null);
    }
  }

  if (!open) {
    return <button className="button secondary quick-add-dj" type="button" onClick={() => setOpen(true)}>+ {label}</button>;
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
            placeholder="Search by name, market, or genre"
          />
        </div>
        <button className="artist-picker-cancel" type="button" onClick={() => { setOpen(false); setQuery(""); }}>Cancel</button>
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
    </div>
  );
}
