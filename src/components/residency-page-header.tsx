import type { ReactNode } from "react";

export function ResidencyPageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return <header className="page-header client-page-header residency-page-header">
    <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>
    {children}
  </header>;
}
