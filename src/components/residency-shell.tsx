"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, switchInternalTestResidency } from "@/app/actions";
import { exitViewAsAction } from "@/app/app/view-as-actions";
import type { ResidencyActor } from "@/lib/auth";

export function ResidencyShell({ actor, children }: { actor: ResidencyActor; children: React.ReactNode }) {
  const pathname = usePathname();
  const links = actor.accessRole === "manager"
    ? [["Calendar", "/residency/calendar"], ["Day Parts", "/residency/dayparts"], ["Talent Roster", "/residency/talent"], ...(actor.clientPaymentStatusVisible ? [["Payment Status", "/residency/payouts"]] : []), ["Invoices", "/residency/invoices"], ["Settings", "/residency/settings"]]
    : [["Calendar", "/residency/calendar"]];
  return <div className="shell client-shell">
    <aside className="sidebar client-sidebar">
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
      <nav className="nav"><p className="nav-label">Workspace</p>{links.map(([label, href]) => <span className="client-nav-slot" key={href}><Link className={pathname === href ? "active" : ""} href={href}>{label}</Link></span>)}</nav>
      <div className="sidebar-footer"><p>{actor.displayName}<br />{actor.email}</p>{actor.isViewAs ? <form action={exitViewAsAction}><button className="button secondary" type="submit">Exit preview</button></form> : <form action={signOut}><button className="button secondary" type="submit">Sign out</button></form>}</div>
    </aside>
    <main className={`main ${pathname === "/residency/calendar" ? "calendar-main" : ""}`}>{actor.isViewAs ? <div className="view-as-banner" role="status"><strong>Viewing as: {actor.residencyName}</strong><form action={exitViewAsAction}><button type="submit">Exit preview</button></form></div> : null}{children}</main>
  </div>;
}
