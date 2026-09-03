export function CalendarStatusLegend({ internal = false }: { internal?: boolean }) {
  return (
    <details className="calendar-status-legend">
      <summary aria-label="Color key" title="Color key">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 10.75V16" />
          <path d="M12 7.5h.01" />
        </svg>
      </summary>
      <div className="calendar-status-legend-menu" aria-label="Calendar scheduling status">
        <span><i className="daypart" />Color: Daypart identity</span>
        <span><i className="needs" />No check: needs or partially scheduled</span>
        <span><i className="scheduled" />Checkmark: scheduled</span>
        <span><i className="hfy-pending" />Faded pink: HFY request pending</span>
        <span><i className={internal ? "daypart-confirmed" : "hfy-confirmed"} />{internal ? "Configured color + check: HFY scheduled" : "Full pink + check: HFY booked"}</span>
      </div>
    </details>
  );
}
