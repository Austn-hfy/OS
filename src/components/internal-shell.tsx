"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { InternalActor } from "@/lib/auth";
import { signOut } from "@/app/actions";
import { PrivacyModeIndicator, PrivacyModeProvider, PrivacyModeToggle } from "@/components/privacy-mode";
import { DayPartsPanel } from "@/components/day-parts-panel";
import { enterViewAsAction } from "@/app/app/view-as-actions";

type ResidencyOption = { id: string; name: string; cityState: string | null; tier: string; active: boolean };
type OwnerMode = "developer" | "hfy";

export function resolveOwnerMode(pathname: string, requestedMode: string | null): OwnerMode {
  const hfyOnlyRoute = ["/app/leads", "/app/calendar", "/app/payouts", "/app/invoices", "/app/talent"]
    .some((route) => pathname.startsWith(route));
  if (hfyOnlyRoute) return "hfy";
  if (requestedMode === "developer") return "developer";
  if (requestedMode === "hfy") return "hfy";
  return pathname.startsWith("/app/setup") ? "developer" : "hfy";
}

export function InternalShell({ actor, residencies, developerResidencies, initialPrivacyMode, children }: { actor: InternalActor; residencies: ResidencyOption[]; developerResidencies: ResidencyOption[]; initialPrivacyMode: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mode = resolveOwnerMode(pathname, searchParams.get("mode"));
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [daypartsExpanded, setDaypartsExpanded] = useState(false);
  const [daypartsResidencyId, setDaypartsResidencyId] = useState<string | null>(null);
  const [talentExpanded, setTalentExpanded] = useState(pathname.startsWith("/app/talent"));
  const inPipeline = pathname.startsWith("/app/leads");
  const residencyId = searchParams.get("residency");
  const residency = mode === "hfy" ? residencies.find((item) => item.id === residencyId) : undefined;
  const inResidency = Boolean(residency) && !inPipeline;
  const contextResidencies = mode === "developer" ? developerResidencies : residencies;
  const mainHref = mode === "developer" ? "/app?mode=developer" : "/app?mode=hfy";
  const residencySuffix = residency
    ? `?${new URLSearchParams({ mode: "hfy", view: "operations", residency: residency.id }).toString()}`
    : "";
  const links: Array<[string, string]> = inResidency ? [
    ["Overview", `/app${residencySuffix}`],
    ["Calendar", `/app/calendar${residencySuffix}`],
    ["Payouts", `/app/payouts${residencySuffix}`],
    ["Invoices", `/app/invoices${residencySuffix}`],
    ["Setup", `/app/setup${residencySuffix}`],
  ] : mode === "developer" ? [
    ["Residencies", "/app?mode=developer"],
    ["Admin Settings", "/app/setup?mode=developer"],
  ] : [
    ["Work Queue", "/app?mode=hfy"],
    ["Operations", "/app?mode=hfy&view=operations"],
    ["Pipeline", "/app/leads?mode=hfy"],
    ["Calendar", "/app/calendar?mode=hfy"],
    ["Payouts", "/app/payouts?mode=hfy"],
    ["Talent", "/app/talent?mode=hfy"],
  ];

  function isActive(label: string, href: string) {
    if (label === "Work Queue") return pathname === "/app" && !residency && searchParams.get("view") !== "operations";
    if (label === "Operations") return pathname === "/app" && (Boolean(residency) || searchParams.get("view") === "operations");
    if (label === "Pipeline") return inPipeline;
    const route = href.split("?")[0];
    return pathname === route;
  }

  const panelResidency = residencies.find((item) => item.id === daypartsResidencyId);
  const contextTitle = mode === "developer" ? "Residencies" : inResidency ? residency?.name : inPipeline ? "Pipeline" : "HFY Programming";
  const contextLabel = mode === "developer" ? "Platform workspace" : inResidency ? "Residency operations" : inPipeline ? "Pipeline workspace" : "Programming workspace";

  return (
    <PrivacyModeProvider initialEnabled={initialPrivacyMode}>
    <div className={`shell owner-shell owner-mode-${mode}`} data-owner-mode={mode}>
      <aside className="sidebar">
        <Link className="brand" href={mainHref} onClick={() => setSwitcherOpen(false)}>
          <span className="brand-mark">HFY</span>
          <span className="brand-copy"><strong>HFY OS</strong><span>{mode === "developer" ? "Platform console" : "Programming desk"}</span></span>
        </Link>
        <div className="owner-mode-switch" aria-label="Owner business mode">
          <Link className={mode === "developer" ? "active" : ""} href="/app?mode=developer"><span>Developer</span><small>Platform</small></Link>
          <Link className={mode === "hfy" ? "active" : ""} href="/app?mode=hfy"><span>HFY</span><small>Programming</small></Link>
        </div>
        <div className="context-switcher-wrap">
          <button className="context-switcher" type="button" aria-expanded={switcherOpen} onClick={() => setSwitcherOpen((open) => !open)}>
            <span><small>{contextLabel}</small><strong>{contextTitle}</strong></span>
            <span className={`context-chevron ${switcherOpen ? "open" : ""}`} aria-hidden="true">⌄</span>
          </button>
          {switcherOpen ? (
            <div className="context-menu">
              <Link className={!inResidency && !inPipeline ? "selected" : ""} href={mainHref} onClick={() => setSwitcherOpen(false)}>
                <span className="context-option-icon">{mode === "developer" ? "DEV" : "HFY"}</span><span><strong>{mode === "developer" ? "Platform dashboard" : "HFY dashboard"}</strong><small>{mode === "developer" ? "Support and administration" : "Programming work queue"}</small></span>
              </Link>
              <div className="context-menu-label">{mode === "developer" ? "Open for support" : "Residencies"}</div>
              {contextResidencies.map((item) => mode === "developer" ? (
                <form action={enterViewAsAction} key={item.id}>
                  <input name="residencyId" type="hidden" value={item.id} />
                  <button type="submit">
                    <span className="context-option-icon hotel">{item.name.slice(0, 1)}</span><span><strong>{item.name}</strong><small>{item.active ? item.cityState || "Location pending" : `Inactive · ${item.cityState || "Location pending"}`}</small></span>
                  </button>
                </form>
              ) : (
                <Link className={residency?.id === item.id ? "selected" : ""} href={`/app?${new URLSearchParams({ mode: "hfy", view: "operations", residency: item.id }).toString()}`} onClick={() => setSwitcherOpen(false)} key={item.id}>
                  <span className="context-option-icon hotel">{item.name.slice(0, 1)}</span><span><strong>{item.name}</strong><small>{item.cityState || "Location pending"}</small></span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        <div className="sidebar-context">
          <span>{mode === "developer" ? "Software business" : inPipeline ? "Pre-signature" : residency ? residency.tier.replaceAll("_", " ") : "HFY Programming"}</span>
          <p>{mode === "developer" ? "Technical support, Platform access, and administration." : inPipeline ? "Leads before they move into Operations." : residency ? residency.cityState || "Location pending" : "Revenue work driven by Standing HFY Bookings."}</p>
        </div>
        <nav className="nav">
          <p className="nav-label">{inResidency ? "Residency" : mode === "developer" ? "Developer" : "HFY"}</p>
          {links.map(([label, href]) => <div className="nav-entry" key={href}>
            {label === "Talent" && !inResidency ? <div className={`day-parts-nav talent-nav ${talentExpanded ? "expanded" : ""}`}>
              <button className={`day-parts-nav-toggle ${pathname.startsWith("/app/talent") ? "active" : ""}`} type="button" aria-expanded={talentExpanded} onClick={() => setTalentExpanded((open) => !open)}><span>Talent</span><span aria-hidden="true">⌄</span></button>
              {talentExpanded ? <div className="day-parts-nav-list"><Link className={pathname === "/app/talent" ? "active" : ""} href="/app/talent?mode=hfy">Artist Lookup</Link><Link className={pathname === "/app/talent/roster" ? "active" : ""} href="/app/talent/roster?mode=hfy">Roster</Link></div> : null}
            </div> : <Link className={isActive(label, href) ? "active" : ""} href={href}>{label}</Link>}
            {mode === "hfy" && label === "Calendar" ? <div className={`day-parts-nav ${daypartsExpanded ? "expanded" : ""}`}>
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
      <main className={`main ${mode === "hfy" && pathname === "/app/calendar" ? "calendar-main" : ""}`}>{mode === "developer" ? <div className="view-as-control"><form action={enterViewAsAction}><label htmlFor="view-as-residency">Open workspace</label><select id="view-as-residency" name="residencyId" defaultValue=""><option value="" disabled>Select a Residency</option>{developerResidencies.map((item) => <option value={item.id} key={item.id}>{item.name}{item.active ? "" : " · Inactive"}</option>)}</select><button className="button secondary" type="submit">Open</button></form></div> : null}<PrivacyModeIndicator />{children}</main>
      {panelResidency ? <DayPartsPanel key={panelResidency.id} residencyId={panelResidency.id} residencyName={panelResidency.name} onClose={() => { setDaypartsResidencyId(null); if (inResidency) setDaypartsExpanded(false); }} /> : null}
    </div>
    </PrivacyModeProvider>
  );
}
