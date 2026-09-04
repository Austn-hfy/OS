"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PublicCalendarLinkManager } from "@/components/public-calendar-link-manager";
import type { PublicCalendarLinkSettings } from "@/data/internal";
import styles from "./public-calendar-link-manager.module.css";

type ShareableDaypart = { id: string; name: string; room: string; color: string };

export function CalendarShareButton({ residencyId, residencyName, linkSettings, dayparts }: { residencyId: string; residencyName: string; linkSettings: PublicCalendarLinkSettings; dayparts: ShareableDaypart[] }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const priorOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ) ?? [])].filter((element) => !element.hidden);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleDialogKeys);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = priorOverflow;
      window.removeEventListener("keydown", handleDialogKeys);
      trigger?.focus();
    };
  }, [open]);

  return <>
    <button className="button secondary calendar-share-button" type="button" ref={triggerRef} onClick={() => setOpen(true)}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
        <path d="M12 15V4" />
        <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
        <path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
      </svg>
      <span>Share calendar</span>
    </button>
    {open ? createPortal(<div className={`quick-modal-backdrop ${styles.modalBackdrop}`} onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
      <section className={`quick-modal ${styles.modal}`} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="calendar-share-title" aria-describedby="calendar-share-description">
        <header className={`quick-modal-header ${styles.modalHeader}`}>
          <div><p className="eyebrow">{residencyName}</p><h2 id="calendar-share-title">Share calendar</h2><p id="calendar-share-description">Create and manage read-only links for trusted partners.</p></div>
          <button className="quick-modal-close" type="button" ref={closeRef} aria-label="Close share calendar" onClick={() => setOpen(false)}>×</button>
        </header>
        <div className={`quick-modal-body ${styles.modalBody}`}>
          <PublicCalendarLinkManager residencyId={residencyId} linkSettings={linkSettings} dayparts={dayparts} />
        </div>
      </section>
    </div>, document.body) : null}
  </>;
}
