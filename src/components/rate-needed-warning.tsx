export function RateNeededWarning({ compact = false }: { compact?: boolean }) {
  return <span className={`artist-rate-needed-badge ${compact ? "compact" : ""}`}>
    <span className="artist-rate-needed-mark" aria-hidden="true">!</span>
    <span>Rate needed</span>
  </span>;
}
