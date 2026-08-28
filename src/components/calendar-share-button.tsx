"use client";

import { useEffect, useState } from "react";
import { PublicCalendarLinkManager } from "@/components/public-calendar-link-manager";
import type { PublicCalendarLinkSettings } from "@/data/internal";

type ShareableDaypart = { id: string; name: string; room: string; color: string };

export function CalendarShareButton({ residencyId, residencyName, linkSettings, dayparts }: { residencyId: string; residencyName: string; linkSettings: PublicCalendarLinkSettings; dayparts: ShareableDaypart[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const priorOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = priorOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return <>
    <button className="button secondary calendar-share-button" type="button" onClick={() => setOpen(true)}>Share calendar</button>
    {open ? <div className="quick-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
      <section className="quick-modal calendar-share-modal" role="dialog" aria-modal="true" aria-labelledby="calendar-share-title">
        <header className="quick-modal-header">
          <div><p className="eyebrow">{residencyName}</p><h2 id="calendar-share-title">Share calendar</h2><p>Create a read-only link for trusted partners.</p></div>
          <button className="quick-modal-close" type="button" aria-label="Close share calendar" onClick={() => setOpen(false)}>×</button>
        </header>
        <div className="quick-modal-body">
          <PublicCalendarLinkManager compact residencyId={residencyId} linkSettings={linkSettings} dayparts={dayparts} />
        </div>
      </section>
    </div> : null}
  </>;
}
