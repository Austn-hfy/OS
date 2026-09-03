export function CalendarStatusLegend({ internal = false }: { internal?: boolean }) {
  return (
    <details className="calendar-status-legend" data-internal={internal || undefined}>
      <summary>Color key</summary>
      <div className="calendar-status-legend-menu" aria-label="Calendar scheduling status">
        <span><i className="daypart" />Color: Daypart identity</span>
        <span><i className="needs" />No check: needs or partially scheduled</span>
        <span><i className="scheduled" />Checkmark: scheduled</span>
        <span><i className="hfy-pending" />Outlined pink dot: HFY request pending</span>
        <span><i className="hfy-confirmed" />Filled pink dot: HFY booked</span>
      </div>
    </details>
  );
}
