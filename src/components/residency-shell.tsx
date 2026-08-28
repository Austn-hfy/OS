"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/app/actions";
import { DayPartsPanel } from "@/components/day-parts-panel";
import type { ResidencyActor } from "@/lib/auth";

export function ResidencyShell({ actor, children }: { actor: ResidencyActor; children: React.ReactNode }) {
  const pathname = usePathname();
  const [dayPartsOpen, setDayPartsOpen] = useState(false);
  const links = actor.accessRole === "manager"
    ? [["Overview", "/residency"], ["Calendar", "/residency/calendar"], ["Talent roster", "/residency/talent"], ["Payout status", "/residency/payouts"]]
    : [["Calendar", "/residency/calendar"]];
  return <div className="shell client-shell">
    <aside className="sidebar client-sidebar">
      <Link className="brand" href="/residency/calendar"><span className="brand-mark">HFY</span><span className="brand-copy"><strong>HFY OS</strong><span>Residency calendar</span></span></Link>
      <div className="client-residency-context"><small>Your Residency</small><strong>{actor.residencyName}</strong></div>
      <nav className="nav"><p className="nav-label">Workspace</p>{links.map(([label, href]) => <span className="client-nav-item" key={href}><Link className={pathname === href ? "active" : ""} href={href}>{label}</Link>{href === "/residency/calendar" && actor.accessRole === "manager" ? <button className="client-dayparts-button" type="button" onClick={() => setDayPartsOpen(true)}>Day Parts</button> : null}</span>)}</nav>
      <div className="sidebar-footer"><p>{actor.displayName}<br />{actor.email}</p><form action={signOut}><button className="button secondary" type="submit">Sign out</button></form></div>
    </aside>
    <main className={`main ${pathname === "/residency/calendar" ? "calendar-main" : ""}`}>{children}</main>
    {dayPartsOpen ? <DayPartsPanel residencyId={actor.residencyId} residencyName={actor.residencyName} onClose={() => setDayPartsOpen(false)} hideFinancials /> : null}
  </div>;
}
