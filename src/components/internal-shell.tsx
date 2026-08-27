"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { InternalActor } from "@/lib/auth";
import { signOut } from "@/app/actions";
import { PrivacyModeIndicator, PrivacyModeProvider, PrivacyModeToggle } from "@/components/privacy-mode";

type ResidencyOption = { id: string; name: string; cityState: string | null; tier: string };

export function InternalShell({ actor, residencies, initialPrivacyMode, children }: { actor: InternalActor; residencies: ResidencyOption[]; initialPrivacyMode: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [switcherOpen, setSwitcherOpen] = useState(false);
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
          {links.map(([label, href]) => <Link className={isActive(href) ? "active" : ""} href={href} key={href}>{label}</Link>)}
        </nav>
        <div className="sidebar-footer">
          <PrivacyModeToggle />
          <p>{actor.displayName}<br />{actor.email}</p>
          <form action={signOut}><button className="button secondary" type="submit">Sign out</button></form>
        </div>
      </aside>
      <main className={`main ${pathname === "/app/calendar" ? "calendar-main" : ""}`}><PrivacyModeIndicator />{children}</main>
    </div>
    </PrivacyModeProvider>
  );
}
