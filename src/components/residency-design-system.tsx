import Link from "next/link";
import type { ChangeEventHandler, ReactNode } from "react";
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

export function ResidencyCollectionPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <ResidencySurfaceCard className={classes("residency-collection-panel", className)}>{children}</ResidencySurfaceCard>;
}

export function ResidencyCollectionToolbar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={classes("artist-roster-toolbar", "residency-collection-toolbar", className)}>{children}</div>;
}

export function ResidencyCollectionSearch({
  id,
  label,
  placeholder,
  value,
  onChange,
  className = "",
}: {
  id: string;
  label: ReactNode;
  placeholder?: string;
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  className?: string;
}) {
  return <div className={classes("artist-search-field", "residency-collection-search", className)}>
    <label htmlFor={id}>{label}</label>
    <div>
      <span aria-hidden="true"><svg viewBox="0 0 20 20" focusable="false"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg></span>
      <input id={id} type="search" value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  </div>;
}

export function ResidencyCollectionFilters<T extends string>({
  value,
  items,
  onChange,
  ariaLabel,
  className = "",
}: {
  value: T;
  items: Array<{ id: T; label: ReactNode; count?: ReactNode }>;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return <div className={classes("artist-roster-tabs", "residency-collection-filters", className)} data-tab-count={items.length} role="tablist" aria-label={ariaLabel}>
    <div>{items.map((item) => <button className={value === item.id ? "active" : ""} type="button" role="tab" aria-selected={value === item.id} onClick={() => onChange(item.id)} key={item.id}><span>{item.label}</span>{item.count === undefined ? null : <strong>{item.count}</strong>}</button>)}</div>
  </div>;
}

export function ResidencyCollectionUtility<T extends string>({
  count,
  countLabel,
  sortLabel,
  sortValue,
  sortOptions,
  onSortChange,
  className = "",
}: {
  count: number;
  countLabel: ReactNode;
  sortLabel: ReactNode;
  sortValue: T;
  sortOptions: Array<{ value: T; label: ReactNode }>;
  onSortChange: (value: T) => void;
  className?: string;
}) {
  return <div className={classes("artist-roster-sort", "residency-collection-utility", className)}>
    <span><strong>{count}</strong> {countLabel}</span>
    <label>{sortLabel}<select value={sortValue} onChange={(event) => onSortChange(event.target.value as T)}>{sortOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
  </div>;
}

export function ResidencyCollectionList({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={classes("artist-roster-list", "residency-collection-list", className)}>{children}</div>;
}

export function ResidencyCollectionRow({
  title,
  meta,
  trailing,
  selected = false,
  onSelect,
  className = "",
}: {
  title: ReactNode;
  meta: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
  onSelect: () => void;
  className?: string;
}) {
  return <div className={classes("artist-roster-row-wrap", "residency-collection-row-wrap", selected && "selected", className)}>
    <button className="artist-roster-row residency-collection-row" type="button" onClick={onSelect}>
      <span className="artist-roster-row-heading residency-collection-row-heading"><strong>{title}</strong>{trailing ? <span className="artist-roster-signals residency-collection-row-signals">{trailing}</span> : null}</span>
      <span className="artist-roster-meta residency-collection-row-meta">{meta}</span>
    </button>
  </div>;
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
