"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut, switchInternalTestResidency } from "@/app/actions";
import { exitViewAsAction } from "@/app/app/view-as-actions";
import type { ResidencyActor } from "@/lib/auth";

type ResidencyNavIconName = "calendar" | "dayparts" | "talent" | "payouts" | "invoices" | "settings";

function ResidencyNavIcon({ name }: { name: ResidencyNavIconName }) {
  return <span className="residency-nav-icon" aria-hidden="true">{name === "calendar" ? <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>
    : name === "dayparts" ? <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10" /><circle cx="18" cy="17" r="2" /></svg>
      : name === "talent" ? <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.6-3.2 2.5-5 5.5-5s4.9 1.8 5.5 5M17 7v8M14 10h6" /></svg>
        : name === "payouts" ? <svg viewBox="0 0 24 24"><path d="M4 6h16v12H4zM8 10h8M8 14h5" /></svg>
          : name === "invoices" ? <svg viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6zM14 3v4h4M9 12h6M9 16h6" /></svg>
            : <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9A1.7 1.7 0 0 0 21 10h.2v4H21a1.7 1.7 0 0 0-1.6 1z" /></svg>}</span>;
}

function ResidencyNavLink({ href, label, description, icon, active }: { href: string; label: string; description: string; icon: ResidencyNavIconName; active: boolean }) {
  return <Link className={`residency-nav-item ${active ? "active" : ""}`} href={href}>
    <ResidencyNavIcon name={icon} />
    <span className="residency-nav-copy"><strong>{label}</strong><small>{description}</small></span>
    <span className="residency-nav-arrow" aria-hidden="true">›</span>
  </Link>;
}

export function ResidencyShell({ actor, children }: { actor: ResidencyActor; children: React.ReactNode }) {
  const pathname = usePathname();
  const [talentExpanded, setTalentExpanded] = useState(pathname.startsWith("/residency/talent"));
  const canManage = actor.accessRole === "manager";
  return <div className="shell client-shell">
    <aside className={`sidebar client-sidebar ${canManage ? "residency-sidebar-with-settings" : ""}`}>
      <Link className="brand" href="/residency/calendar"><span className="brand-mark">HFY</span><span className="brand-copy"><strong>HFY OS</strong><span>{actor.isViewAs ? "Residency preview" : "Residency calendar"}</span></span></Link>
      <div className="client-residency-context"><small>Your Residency</small><strong>{actor.residencyName}</strong></div>
      {actor.isInternalTest && !actor.isViewAs ? <form action={switchInternalTestResidency} className="internal-test-residency-switcher">
        <span>Internal test account</span>
        <label htmlFor="internal-test-residency">Test Residency</label>
        <select id="internal-test-residency" name="residencyId" defaultValue={actor.residencyId}>
          {actor.availableResidencies.map((residency) => <option key={residency.residencyId} value={residency.residencyId}>{residency.residencyName}</option>)}
        </select>
        <button className="button secondary" type="submit">Switch Residency</button>
      </form> : null}
      <nav className="nav residency-workspace-nav" aria-label="Residency workspace">
        <p className="nav-label">Workspace</p>
        <ResidencyNavLink href="/residency/calendar" label="Calendar" description="Schedule and bookings" icon="calendar" active={pathname === "/residency/calendar"} />
        {canManage ? <>
          <ResidencyNavLink href="/residency/dayparts" label="Day Parts" description="Standing schedule" icon="dayparts" active={pathname === "/residency/dayparts"} />
          <div className={`residency-talent-nav ${talentExpanded ? "expanded" : ""}`}>
            <button className={`residency-nav-item residency-talent-toggle ${pathname.startsWith("/residency/talent") ? "active-section" : ""}`} type="button" aria-expanded={talentExpanded} aria-controls="residency-talent-links" onClick={() => setTalentExpanded((open) => !open)}>
              <ResidencyNavIcon name="talent" />
              <span className="residency-nav-copy"><strong>Talent</strong><small>Artists and roster</small></span>
              <span className="residency-nav-caret" aria-hidden="true">⌄</span>
            </button>
            {talentExpanded ? <div className="residency-talent-links" id="residency-talent-links"><Link className={pathname === "/residency/talent" ? "active" : ""} href="/residency/talent"><span>Artist Lookup</span><span aria-hidden="true">›</span></Link><Link className={pathname === "/residency/talent/roster" ? "active" : ""} href="/residency/talent/roster"><span>Roster</span><span aria-hidden="true">›</span></Link></div> : null}
          </div>
          {actor.clientPaymentStatusVisible ? <ResidencyNavLink href="/residency/payouts" label="Payouts" description="What this Residency owes" icon="payouts" active={pathname === "/residency/payouts"} /> : null}
          <ResidencyNavLink href="/residency/invoices" label="Invoices" description="Approved and sent" icon="invoices" active={pathname === "/residency/invoices"} />
        </> : null}
      </nav>
      {canManage ? <div className="residency-sidebar-settings"><ResidencyNavLink href="/residency/settings" label="Settings" description="Residency details and contacts" icon="settings" active={pathname === "/residency/settings"} /></div> : null}
      <div className="sidebar-footer"><p>{actor.displayName}<br />{actor.email}</p>{actor.isViewAs ? <form action={exitViewAsAction}><button className="button secondary" type="submit">Exit preview</button></form> : <form action={signOut}><button className="button secondary" type="submit">Sign out</button></form>}</div>
    </aside>
    <main className={`main ${pathname === "/residency/calendar" ? "calendar-main" : ""}`}>{actor.isViewAs ? <div className="view-as-banner" role="status"><strong>Viewing as: {actor.residencyName}</strong><span>Changes made here are live for this Residency.</span><form action={exitViewAsAction}><button type="submit">Exit preview</button></form></div> : null}{children}</main>
  </div>;
}
