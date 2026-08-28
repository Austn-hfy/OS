export function CalendarStatusLegend() {
  return (
    <details className="calendar-status-legend">
      <summary>Color key</summary>
      <div className="calendar-status-legend-menu" aria-label="Calendar scheduling status">
        <span><i className="needs" />Strong color: needs scheduling</span>
        <span><i className="partial" />Medium color: partially scheduled</span>
        <span><i className="scheduled" />Soft color + check: scheduled</span>
      </div>
    </details>
  );
}
