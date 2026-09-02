export function ResidencyPageHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <header className="page-header client-page-header residency-page-header">
    <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>
  </header>;
}
