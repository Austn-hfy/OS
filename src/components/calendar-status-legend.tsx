export function CalendarStatusLegend() {
  return (
    <div className="calendar-status-legend" aria-label="Calendar scheduling status">
      <span><i className="needs" />Strong color: needs scheduling</span>
      <span><i className="partial" />Medium color: partially scheduled</span>
      <span><i className="scheduled" />Soft color + check: scheduled</span>
    </div>
  );
}
