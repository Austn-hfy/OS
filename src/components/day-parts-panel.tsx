"use client";

import { useCallback, useEffect, useState } from "react";
import { DaypartManager, type DaypartRow } from "@/app/app/setup/daypart-manager";

async function requestDayparts(residencyId: string, hfyOnly: boolean) {
  const query = hfyOnly ? "?scope=hfy" : "";
  const response = await fetch(`/api/internal/residencies/${encodeURIComponent(residencyId)}/dayparts${query}`, { cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 404 ? "This Residency is no longer active." : "Unable to load Day Parts.");
  return (await response.json() as { dayparts: DaypartRow[] }).dayparts;
}

export function DayPartsPanel({ residencyId, residencyName, onClose, readOnly = false, hideFinancials = false, initialCreate = false, hfyOnly = false }: { residencyId: string; residencyName: string; onClose: () => void; readOnly?: boolean; hideFinancials?: boolean; initialCreate?: boolean; hfyOnly?: boolean }) {
  const [dayparts, setDayparts] = useState<DaypartRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setDayparts(await requestDayparts(residencyId, hfyOnly));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load Day Parts.");
    } finally {
      setLoading(false);
    }
  }, [hfyOnly, residencyId]);

  useEffect(() => {
    let active = true;
    requestDayparts(residencyId, hfyOnly)
      .then((rows) => { if (active) setDayparts(rows); })
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
    <aside className="day-parts-panel" role="dialog" aria-modal="true" aria-labelledby="day-parts-panel-title">
      <header className="day-parts-panel-header"><div><p className="eyebrow">{residencyName}</p><h2 id="day-parts-panel-title">Day Parts</h2><p>{readOnly ? "Standing weekly schedule for this Residency." : "Review and edit the standing weekly schedule without leaving the calendar."}</p></div><button className="quick-modal-close" type="button" aria-label="Close Day Parts" onClick={onClose}>×</button></header>
      <div className="day-parts-panel-scroll">
        {loading ? <div className="card empty">Loading Day Parts…</div> : error ? <div className="card empty error">{error}<button className="button secondary" type="button" onClick={() => void load()}>Try again</button></div> : <DaypartManager residencyId={residencyId} dayparts={dayparts} onSaved={() => void load()} readOnly={readOnly} hideFinancials={hideFinancials} initialCreate={initialCreate} />}
      </div>
    </aside>
  </div>;
}
