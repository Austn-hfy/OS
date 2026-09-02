"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, switchInternalTestResidency } from "@/app/actions";
import { exitViewAsAction } from "@/app/app/view-as-actions";
import type { ResidencyActor } from "@/lib/auth";
import { WorkspaceNavLink } from "@/components/workspace-nav";

export function ResidencyShell({ actor, children }: { actor: ResidencyActor; children: React.ReactNode }) {
  const pathname = usePathname();
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
        <WorkspaceNavLink href="/residency/calendar" label="Calendar" description="Schedule and bookings" icon="calendar" active={pathname === "/residency/calendar"} />
        {canManage ? <>
          <WorkspaceNavLink href="/residency/dayparts" label="Day Parts" description="Standing schedule" icon="dayparts" active={pathname === "/residency/dayparts"} />
          <WorkspaceNavLink href="/residency/talent" label="Talent" description="Artist lookup" icon="talent" active={pathname === "/residency/talent"} />
          {actor.clientPaymentStatusVisible ? <WorkspaceNavLink href="/residency/payouts" label="Payouts" description="What this Residency owes" icon="payouts" active={pathname === "/residency/payouts"} /> : null}
          <WorkspaceNavLink href="/residency/invoices" label="Invoices" description="Approved and sent" icon="invoices" active={pathname === "/residency/invoices"} />
        </> : null}
      </nav>
      {canManage ? <div className="residency-sidebar-settings"><WorkspaceNavLink href="/residency/settings" label="Settings" description="Residency details and contacts" icon="settings" active={pathname === "/residency/settings"} /></div> : null}
      <div className="sidebar-footer"><p>{actor.displayName}<br />{actor.email}</p>{actor.isViewAs ? <form action={exitViewAsAction}><button className="button secondary" type="submit">Exit preview</button></form> : <form action={signOut}><button className="button secondary" type="submit">Sign out</button></form>}</div>
    </aside>
    <main className={`main ${pathname === "/residency/calendar" ? "calendar-main" : ""}`}>{actor.isViewAs ? <div className="view-as-banner" role="status"><strong>Viewing as: {actor.residencyName}</strong><span>Changes made here are live for this Residency.</span><form action={exitViewAsAction}><button type="submit">Exit preview</button></form></div> : null}{children}</main>
  </div>;
}
