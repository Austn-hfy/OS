"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { signOut, switchInternalTestResidency } from "@/app/actions";
import { exitViewAsAction } from "@/app/app/view-as-actions";
import type { ResidencyActor } from "@/lib/auth";
import { WorkspaceNavLink } from "@/components/workspace-nav";
import { DaypartRateAttentionReportProvider, type DaypartRateAttentionReport } from "@/components/daypart-rate-attention-context";

export function ResidencyShell({ actor, children }: { actor: ResidencyActor; children: React.ReactNode }) {
  const pathname = usePathname();
  const canManage = actor.accessRole === "manager";
  const [needsDaypartRateAttention, setNeedsDaypartRateAttention] = useState(Boolean(actor.needsDaypartRateAttention));
  const actorAttentionSnapshot = `${actor.residencyId}:${Boolean(actor.needsDaypartRateAttention)}`;
  const previousActorAttentionSnapshot = useRef(actorAttentionSnapshot);

  useEffect(() => {
    if (previousActorAttentionSnapshot.current === actorAttentionSnapshot) return;
    previousActorAttentionSnapshot.current = actorAttentionSnapshot;
    setNeedsDaypartRateAttention(Boolean(actor.needsDaypartRateAttention));
  }, [actor.needsDaypartRateAttention, actorAttentionSnapshot]);

  const reportDaypartRateAttention = useCallback((report: DaypartRateAttentionReport) => {
    if (report.audience === "residency" && report.residencyId === actor.residencyId) {
      setNeedsDaypartRateAttention(report.needsAttention);
    }
  }, [actor.residencyId]);

  return <DaypartRateAttentionReportProvider onReport={reportDaypartRateAttention}><div className="shell client-shell">
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
          <WorkspaceNavLink href="/residency/dayparts" label="Day Parts" description="Standing schedule" icon="dayparts" active={pathname === "/residency/dayparts"} attention={needsDaypartRateAttention} />
          <WorkspaceNavLink href="/residency/talent" label="Talent" description="Artist lookup" icon="talent" active={pathname === "/residency/talent"} />
          <WorkspaceNavLink href="/residency/finances" label="Finances" description="Talent invoices and obligations" icon="invoices" active={pathname === "/residency/finances"} />
        </> : null}
      </nav>
      {canManage ? <div className="residency-sidebar-settings"><WorkspaceNavLink href="/residency/settings" label="Settings" description="Account and Platform billing" icon="settings" active={pathname.startsWith("/residency/settings")} /></div> : null}
      <div className="sidebar-footer"><p>{actor.displayName}<br />{actor.email}</p>{actor.isViewAs ? <form action={exitViewAsAction}><button className="button secondary" type="submit">Exit preview</button></form> : <form action={signOut}><button className="button secondary" type="submit">Sign out</button></form>}</div>
    </aside>
    <main className={`main ${pathname === "/residency/calendar" ? "calendar-main" : ""}`}>{actor.isViewAs ? <div className="view-as-banner" role="status"><strong>Viewing as: {actor.residencyName}</strong><span>Changes made here are live for this Residency.</span><form action={exitViewAsAction}><button type="submit">Exit preview</button></form></div> : null}{children}</main>
  </div></DaypartRateAttentionReportProvider>;
}
