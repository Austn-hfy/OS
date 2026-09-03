"use client";

import { useCallback, useEffect, useState } from "react";
import { DaypartManager, type DaypartRow } from "@/app/app/setup/daypart-manager";
import type { ResidencyRoom } from "@/services/rooms";

async function requestDayparts(residencyId: string, hfyOnly: boolean) {
  const query = hfyOnly ? "?scope=hfy" : "";
  const response = await fetch(`/api/internal/residencies/${encodeURIComponent(residencyId)}/dayparts${query}`, { cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 404 ? "This Residency is no longer active." : "Unable to load Day Parts.");
  return await response.json() as { dayparts: DaypartRow[]; rooms: ResidencyRoom[] };
}

export function DayPartsPanel({ residencyId, residencyName, onClose, onSaved, readOnly = false, hideFinancials = false, initialCreate = false, hfyOnly = false, fullProgrammingClient = false }: { residencyId: string; residencyName: string; onClose: () => void; onSaved?: () => void; readOnly?: boolean; hideFinancials?: boolean; initialCreate?: boolean; hfyOnly?: boolean; fullProgrammingClient?: boolean }) {
  const [dayparts, setDayparts] = useState<DaypartRow[]>([]);
  const [rooms, setRooms] = useState<ResidencyRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await requestDayparts(residencyId, hfyOnly);
      setDayparts(result.dayparts);
      setRooms(result.rooms);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load Day Parts.");
    } finally {
      setLoading(false);
    }
  }, [hfyOnly, residencyId]);

  useEffect(() => {
    let active = true;
    requestDayparts(residencyId, hfyOnly)
      .then((result) => { if (active) { setDayparts(result.dayparts); setRooms(result.rooms); } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load Day Parts."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [hfyOnly, residencyId]);
  useEffect(() => {
    const previous = document.body.style.overflow;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [onClose]);

  return <div className="day-parts-panel-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <aside className="day-parts-panel" role="dialog" aria-modal="true" aria-label={`${residencyName} Day Parts`}>
      <div className="day-parts-panel-scroll">
        {loading ? <div className="card empty">Loading Day Parts…</div> : error ? <div className="card empty error">{error}<button className="button secondary" type="button" onClick={() => void load()}>Try again</button></div> : <DaypartManager residencyId={residencyId} dayparts={dayparts} residencyRooms={rooms} onSaved={() => { if (onSaved) onSaved(); else void load(); }} onClose={onClose} readOnly={readOnly} hideFinancials={hideFinancials} initialCreate={initialCreate} fullProgrammingClient={fullProgrammingClient} />}
      </div>
    </aside>
  </div>;
}
