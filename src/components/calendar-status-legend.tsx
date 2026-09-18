"use client";

import { useEffect, useRef } from "react";

export function CalendarStatusLegend({ internal = false }: { internal?: boolean }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const closeLegend = (restoreFocus: boolean) => {
      if (!detailsRef.current?.open) return;
      detailsRef.current.removeAttribute("open");
      if (restoreFocus) detailsRef.current.querySelector<HTMLElement>("summary")?.focus();
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (detailsRef.current && event.target instanceof Node && !detailsRef.current.contains(event.target)) closeLegend(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeLegend(true);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <details className="calendar-status-legend" data-internal={internal || undefined} ref={detailsRef}>
      <summary role="button" aria-label="Color key" title="Color key">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 10.75V16" />
          <path d="M12 7.5h.01" />
        </svg>
      </summary>
      <div className="calendar-status-legend-menu" aria-label="Calendar scheduling status">
        <span><i className="daypart" />Color rail: Daypart identity</span>
        <span><i className="needs" />Orange mark: needs or partially scheduled</span>
        <span><i className="scheduled" />No status mark: scheduled</span>
        <span><i className="hfy-pending" />Outlined pink dot: HFY request pending</span>
        <span><i className="hfy-confirmed" />Filled pink dot: HFY booked</span>
      </div>
    </details>
  );
}
