import Link from "next/link";
import type { ReactNode } from "react";
import { ResidencyPageHeader } from "./residency-page-header";
import { WorkspaceSurface } from "./workspace-surface";

function classes(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(" ");
}

export function ResidencyPageSurface({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <WorkspaceSurface className={classes("residency-workspace-surface", "residency-page-surface", className)}>{children}</WorkspaceSurface>;
}

export { ResidencyPageHeader };

export function ResidencyPageBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={classes("residency-page-body", className)}>{children}</div>;
}

export function ResidencyTabs({
  activeHref,
  items,
  ariaLabel,
  className = "",
}: {
  activeHref: string;
  items: Array<{ href: string; label: string }>;
  ariaLabel: string;
  className?: string;
}) {
  return <nav className={classes("residency-tabs", className)} aria-label={ariaLabel}>
    {items.map((item) => <Link key={item.href} className={item.href === activeHref ? "active" : undefined} aria-current={item.href === activeHref ? "page" : undefined} href={item.href}>{item.label}</Link>)}
  </nav>;
}

export function ResidencySurfaceCard({
  as: Component = "section",
  children,
  className = "",
  id,
  variant = "white",
}: {
  as?: "article" | "section";
  children: ReactNode;
  className?: string;
  id?: string;
  variant?: "frosted" | "white";
}) {
  return <Component className={classes("card", "residency-surface-card", `residency-surface-card--${variant}`, className)} id={id}>{children}</Component>;
}

export function ResidencySectionHeader({
  eyebrow,
  title,
  description,
  aside,
  split = false,
  className = "",
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  split?: boolean;
  className?: string;
}) {
  const copy = <>
    <p className="eyebrow">{eyebrow}</p>
    <h2>{title}</h2>
    {description ? <p>{description}</p> : null}
  </>;

  if (split) {
    return <div className={classes("residency-section-header", "residency-section-header--split", className)}><div>{copy}</div>{aside}</div>;
  }

  return <div className={classes("residency-section-header", className)}>{copy}</div>;
}

export function ResidencyMetricGrid({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={classes("residency-metric-grid", className)}>{children}</section>;
}

export function ResidencyFactGrid({
  facts,
  className = "",
}: {
  facts: Array<{ key: string; label: ReactNode; value: ReactNode }>;
  className?: string;
}) {
  return <dl className={classes("residency-fact-grid", className)}>
    {facts.map((fact) => <div key={fact.key}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
  </dl>;
}
