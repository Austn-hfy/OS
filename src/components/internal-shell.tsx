"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { InternalActor } from "@/lib/auth";
import { signOut } from "@/app/actions";
import { PrivacyModeIndicator, PrivacyModeProvider, PrivacyModeToggle } from "@/components/privacy-mode";
import { DayPartsPanel } from "@/components/day-parts-panel";
import { enterViewAsAction } from "@/app/app/view-as-actions";

type ResidencyOption = { id: string; name: string; cityState: string | null; tier: string };

export function InternalShell({ actor, residencies, initialPrivacyMode, children }: { actor: InternalActor; residencies: ResidencyOption[]; initialPrivacyMode: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [daypartsExpanded, setDaypartsExpanded] = useState(false);
  const [daypartsResidencyId, setDaypartsResidencyId] = useState<string | null>(null);
  const [artistLookupExpanded, setArtistLookupExpanded] = useState(pathname.startsWith("/app/talent"));
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
    ["Payouts", "/app/payouts"],
    ["Talent", "/app/talent"],
    ["Admin settings", "/app/setup"],
  ];

  function isActive(href: string) {
    const route = href.split("?")[0];
    return pathname === route;
  }

  const panelResidency = residencies.find((item) => item.id === daypartsResidencyId);

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
        {!inResidency ? <div className="mode-switch" aria-label="HFY mode"><Link className={!inPipeline ? "active" : ""} href="/app">Operations</Link><Link className={inPipeline ? "active" : ""} href="/app/leads">Pipeline</Link></div> : null}
        <div className="sidebar-context">
          <span>{inPipeline ? "Pre-signature" : residency ? residency.tier.replaceAll("_", " ") : "Company-wide"}</span>
          <p>{inPipeline ? "Leads before they move into Operations." : residency ? residency.cityState || "Location pending" : "Every new-system residency in one place."}</p>
        </div>
        <nav className="nav">
          <p className="nav-label">{inPipeline ? "Pipeline" : inResidency ? "Residency" : "HFY company"}</p>
          {links.map(([label, href]) => <div className="nav-entry" key={href}>
            {label === "Talent" && !inResidency ? <div className={`day-parts-nav artist-lookup-nav ${artistLookupExpanded ? "expanded" : ""}`}>
              <button className={`day-parts-nav-toggle ${pathname.startsWith("/app/talent") ? "active" : ""}`} type="button" aria-expanded={artistLookupExpanded} onClick={() => setArtistLookupExpanded((open) => !open)}><span>Talent</span><span aria-hidden="true">⌄</span></button>
              {artistLookupExpanded ? <div className="day-parts-nav-list"><Link className={pathname === "/app/talent" ? "active" : ""} href="/app/talent">Artist Lookup</Link><Link className={pathname === "/app/talent/roster" ? "active" : ""} href="/app/talent/roster">Roster</Link></div> : null}
            </div> : <Link className={isActive(href) ? "active" : ""} href={href}>{label}</Link>}
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
