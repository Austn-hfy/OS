import type { ReactNode } from "react";

export function ResidencyPageHeader({ eyebrow, title, description, children }: { eyebrow: string; title: string; description?: ReactNode; children?: ReactNode }) {
  return <header className="page-header client-page-header residency-page-header">
    <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description ? <p className="subhead">{description}</p> : null}</div>
    {children}
  </header>;
}
