"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut, switchInternalTestResidency } from "@/app/actions";
import { DayPartsPanel } from "@/components/day-parts-panel";
import type { ResidencyActor } from "@/lib/auth";

export function ResidencyShell({ actor, children }: { actor: ResidencyActor; children: React.ReactNode }) {
  const pathname = usePathname();
  const [dayPartsOpen, setDayPartsOpen] = useState(false);
  const links = actor.accessRole === "manager"
    ? [["Overview", "/residency"], ["Calendar", "/residency/calendar"], ["Talent roster", "/residency/talent"], ["Payment Status", "/residency/payouts"], ["Invoices", "/residency/invoices"], ["Settings", "/residency/settings"]]
    : [["Calendar", "/residency/calendar"]];
  return <div className="shell client-shell">
    <aside className="sidebar client-sidebar">
      <Link className="brand" href="/residency/calendar"><span className="brand-mark">HFY</span><span className="brand-copy"><strong>HFY OS</strong><span>Residency calendar</span></span></Link>
      <div className="client-residency-context"><small>Your Residency</small><strong>{actor.residencyName}</strong></div>
      {actor.isInternalTest ? <form action={switchInternalTestResidency} className="internal-test-residency-switcher">
        <span>Internal test account</span>
        <label htmlFor="internal-test-residency">Test Residency</label>
        <select id="internal-test-residency" name="residencyId" defaultValue={actor.residencyId}>
          {actor.availableResidencies.map((residency) => <option key={residency.residencyId} value={residency.residencyId}>{residency.residencyName}</option>)}
        </select>
        <button className="button secondary" type="submit">Switch Residency</button>
      </form> : null}
      <nav className="nav"><p className="nav-label">Workspace</p>{links.map(([label, href], index) => <span className="client-nav-slot" key={href}><Link className={pathname === href && !dayPartsOpen ? "active" : ""} href={href}>{label}</Link>{actor.accessRole === "manager" && index === 1 ? <button className={`client-dayparts-button ${dayPartsOpen ? "active" : ""}`} type="button" onClick={() => setDayPartsOpen(true)}>Day Parts</button> : null}</span>)}</nav>
      <div className="sidebar-footer"><p>{actor.displayName}<br />{actor.email}</p><form action={signOut}><button className="button secondary" type="submit">Sign out</button></form></div>
    </aside>
    <main className={`main ${pathname === "/residency/calendar" ? "calendar-main" : ""}`}>{children}</main>
    {dayPartsOpen ? <DayPartsPanel residencyId={actor.residencyId} residencyName={actor.residencyName} onClose={() => setDayPartsOpen(false)} hideFinancials /> : null}
  </div>;
}
