"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { InternalActor } from "@/lib/auth";
import { signOut } from "@/app/actions";
import { PrivacyModeIndicator, PrivacyModeProvider, PrivacyModeToggle } from "@/components/privacy-mode";
import { DayPartsPanel } from "@/components/day-parts-panel";
import { enterViewAsAction, exitViewAsAction } from "@/app/app/view-as-actions";

type ResidencyOption = { id: string; name: string; cityState: string | null; tier: string };

export function InternalShell({ actor, residencies, initialPrivacyMode, viewAsResidency, children }: { actor: InternalActor; residencies: ResidencyOption[]; initialPrivacyMode: boolean; viewAsResidency: ResidencyOption | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [daypartsExpanded, setDaypartsExpanded] = useState(false);
  const [daypartsResidencyId, setDaypartsResidencyId] = useState<string | null>(null);
  const inPipeline = pathname.startsWith("/app/leads");
  const residencyId = searchParams.get("residency");
  const residency = residencies.find((item) => item.id === residencyId);
  const inResidency = Boolean(residency) && !inPipeline;
  const suffix = residency ? `?residency=${residency.id}` : "";
  const links = inPipeline ? [
    ["Leads", "/app/leads"],
  ] : inResidency ? [
    ["Overview", `/app${suffix}`],
    ["Calendar", `/app/calendar${suffix}`],
    ["Payouts", `/app/payouts${suffix}`],
    ["Invoices", `/app/invoices${suffix}`],
    ["Setup", `/app/setup${suffix}`],
  ] : [
    ["Overview", "/app"],
    ["Calendar", "/app/calendar"],
    ["Artist Lookup", "/app/talent"],
    ["Admin settings", "/app/setup"],
  ];

  function isActive(href: string) {
    const route = href.split("?")[0];
    return pathname === route;
  }

  const panelResidency = residencies.find((item) => item.id === daypartsResidencyId);

  const previewRouteIsReady = Boolean(viewAsResidency)
    && pathname === "/app/calendar"
    && searchParams.get("residency") === viewAsResidency?.id;
  useEffect(() => {
    if (!viewAsResidency || previewRouteIsReady) return;
    router.replace(`/app/calendar?residency=${viewAsResidency.id}`);
  }, [previewRouteIsReady, router, viewAsResidency]);

  if (viewAsResidency) {
    return (
      <PrivacyModeProvider initialEnabled>
        <div className="shell view-as-shell">
          <aside className="sidebar">
            <Link className="brand" href={`/app/calendar?residency=${viewAsResidency.id}`}>
              <span className="brand-mark">HFY</span>
              <span className="brand-copy"><strong>HFY OS</strong><span>Residency preview</span></span>
            </Link>
            <div className="context-switcher preview-context"><span><small>Residency workspace</small><strong>{viewAsResidency.name}</strong></span></div>
            <div className="sidebar-context"><span>Hotel operator view</span><p>Financial and company information is hidden.</p></div>
            <nav className="nav">
              <p className="nav-label">Residency</p>
              <div className="nav-entry"><Link className="active" href={`/app/calendar?residency=${viewAsResidency.id}`}>Calendar</Link>
                <div className={`day-parts-nav ${daypartsResidencyId ? "expanded" : ""}`}>
                  <button className="day-parts-nav-toggle" type="button" aria-expanded={Boolean(daypartsResidencyId)} onClick={() => setDaypartsResidencyId((current) => current ? null : viewAsResidency.id)}><span>Day Parts</span><span aria-hidden="true">⌄</span></button>
                </div>
              </div>
            </nav>
            <div className="sidebar-footer"><form action={exitViewAsAction}><button className="button secondary" type="submit">Exit preview</button></form></div>
          </aside>
          <main className="main calendar-main view-as-main">
            <div className="view-as-banner" role="status"><strong>Viewing as: {viewAsResidency.name}</strong><form action={exitViewAsAction}><button type="submit">Exit preview</button></form></div>
            {previewRouteIsReady ? children : <div className="card empty">Opening {viewAsResidency.name} calendar…</div>}
          </main>
          {panelResidency ? <DayPartsPanel key={panelResidency.id} residencyId={panelResidency.id} residencyName={panelResidency.name} onClose={() => setDaypartsResidencyId(null)} /> : null}
        </div>
      </PrivacyModeProvider>
    );
  }

  return (
    <PrivacyModeProvider initialEnabled={initialPrivacyMode}>
    <div className="shell">
      <aside className="sidebar">
        <Link className="brand" href="/app" onClick={() => setSwitcherOpen(false)}>
          <span className="brand-mark">HFY</span>
          <span className="brand-copy"><strong>HFY OS</strong><span>Programming desk</span></span>
        </Link>
        <div className="context-switcher-wrap">
          <button className="context-switcher" type="button" aria-expanded={switcherOpen} onClick={() => setSwitcherOpen((open) => !open)}>
            <span><small>{inResidency ? "Residency workspace" : inPipeline ? "Pipeline workspace" : "HFY workspace"}</small><strong>{inResidency ? residency?.name : inPipeline ? "Pipeline" : "Dashboard"}</strong></span>
            <span className={`context-chevron ${switcherOpen ? "open" : ""}`} aria-hidden="true">⌄</span>
          </button>
          {switcherOpen ? (
            <div className="context-menu">
              <Link className={!inResidency && !inPipeline ? "selected" : ""} href="/app" onClick={() => setSwitcherOpen(false)}>
                <span className="context-option-icon">HFY</span><span><strong>Main dashboard</strong><small>Company-wide overview</small></span>
              </Link>
              <div className="context-menu-label">Residencies</div>
              {residencies.map((item) => (
                <Link className={residency?.id === item.id ? "selected" : ""} href={`/app?residency=${item.id}`} onClick={() => setSwitcherOpen(false)} key={item.id}>
                  <span className="context-option-icon hotel">{item.name.slice(0, 1)}</span><span><strong>{item.name}</strong><small>{item.cityState || "Location pending"}</small></span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        <div className="mode-switch" aria-label="HFY mode"><Link className={!inPipeline ? "active" : ""} href="/app">Operations</Link><Link className={inPipeline ? "active" : ""} href="/app/leads">Pipeline</Link></div>
        <div className="sidebar-context">
          <span>{inPipeline ? "Pre-signature" : residency ? residency.tier.replaceAll("_", " ") : "Company-wide"}</span>
          <p>{inPipeline ? "Leads before they move into Operations." : residency ? residency.cityState || "Location pending" : "Every new-system residency in one place."}</p>
        </div>
        <nav className="nav">
          <p className="nav-label">{inPipeline ? "Pipeline" : inResidency ? "Residency" : "HFY company"}</p>
          {links.map(([label, href]) => <div className="nav-entry" key={href}>
            <Link className={isActive(href) ? "active" : ""} href={href}>{label}</Link>
            {label === "Calendar" ? <div className={`day-parts-nav ${daypartsExpanded ? "expanded" : ""}`}>
              <button className="day-parts-nav-toggle" type="button" aria-expanded={daypartsExpanded} onClick={() => {
                if (inResidency && residency) {
                  const willOpen = daypartsResidencyId !== residency.id;
                  setDaypartsExpanded(willOpen);
                  setDaypartsResidencyId(willOpen ? residency.id : null);
                  return;
                }
                setDaypartsExpanded((open) => !open);
              }}><span>Day Parts</span><span aria-hidden="true">⌄</span></button>
              {!inResidency && daypartsExpanded ? <div className="day-parts-nav-list">{residencies.map((item) => <button type="button" className={daypartsResidencyId === item.id ? "active" : ""} onClick={() => setDaypartsResidencyId(item.id)} key={item.id}>{item.name}</button>)}</div> : null}
            </div> : null}
          </div>)}
        </nav>
        <div className="sidebar-footer">
          <PrivacyModeToggle />
          <p>{actor.displayName}<br />{actor.email}</p>
          <form action={signOut}><button className="button secondary" type="submit">Sign out</button></form>
        </div>
      </aside>
      <main className={`main ${pathname === "/app/calendar" ? "calendar-main" : ""}`}><div className="view-as-control"><form action={enterViewAsAction}><label htmlFor="view-as-residency">View As</label><select id="view-as-residency" name="residencyId" defaultValue=""><option value="" disabled>Select a Residency</option>{residencies.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><button className="button secondary" type="submit">Preview</button></form></div><PrivacyModeIndicator />{children}</main>
      {panelResidency ? <DayPartsPanel key={panelResidency.id} residencyId={panelResidency.id} residencyName={panelResidency.name} onClose={() => { setDaypartsResidencyId(null); if (inResidency) setDaypartsExpanded(false); }} /> : null}
    </div>
    </PrivacyModeProvider>
  );
}
