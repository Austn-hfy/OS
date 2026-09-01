import { formatTimeInput } from "@/components/format";
import { getResidencyClientPayoutStatus } from "@/data/residency-client";
import { canResidencyRoleAccess } from "@/domain/residency-access";
import { requireResidencyActor } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClientRateForm } from "./client-rate-form";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function paidDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export default async function ResidencyPayoutStatusPage() {
  const actor = await requireResidencyActor();
  if (!canResidencyRoleAccess(actor.accessRole, "payout_status")) redirect("/residency/calendar");
  if (!actor.clientPaymentStatusVisible) redirect("/residency/calendar");
  const rows = await getResidencyClientPayoutStatus(actor.residencyId);
  const clientRows = rows.filter((row) => row.ownership === "client");
  const hfyRows = rows.filter((row) => row.ownership === "hfy");
  const owedTotalCents = clientRows.reduce((sum, row) => sum + (row.owedCents ?? 0), 0);
  return <>
    <header className="page-header card"><div><p className="eyebrow">Your money</p><h1>Payment Status</h1><p className="subhead">Track what your Residency owes its own artists. HFY-managed rates remain private and separate.</p></div><div className="client-owed-total"><span>Running total owed</span><strong>{money(owedTotalCents)}</strong></div></header>
    <section className="card"><h2>Your artists</h2><p className="subhead">Optional hourly rates and totals here belong only to your Residency. HFY cannot view or manage them.</p><div className="table-wrap client-payout-table"><table><thead><tr><th>DJ</th><th>Date</th><th>Hours</th><th>Your hourly rate</th><th>Owed</th></tr></thead><tbody>{clientRows.length ? clientRows.map((row) => <tr key={row.id}><td><strong>{row.artist}</strong></td><td>{row.serviceDate}</td><td>{formatTimeInput(new Date(row.startsAt), actor.residencyTimezone)}–{formatTimeInput(new Date(row.endsAt), actor.residencyTimezone)}</td><td><ClientRateForm assignmentId={row.id} rateCents={row.clientRateCents} /></td><td><strong>{row.owedCents === null ? "—" : money(row.owedCents)}</strong></td></tr>) : <tr><td colSpan={5}>No client-owned artist assignments yet.</td></tr>}</tbody></table></div></section>
    {hfyRows.length ? <section className="card"><h2>HFY-provided artists</h2><p className="subhead">Status only. HFY rates and artist payouts are not visible here; the client-billed amount appears on your Invoice.</p><div className="table-wrap client-payout-table"><table><thead><tr><th>DJ</th><th>Scheduled date</th><th>Hours</th><th>Status</th><th>Paid date</th></tr></thead><tbody>{hfyRows.map((row) => <tr key={row.id}><td><strong>{row.artist}</strong></td><td>{row.serviceDate}</td><td>{formatTimeInput(new Date(row.startsAt), actor.residencyTimezone)}–{formatTimeInput(new Date(row.endsAt), actor.residencyTimezone)}</td><td><span className={`status ${row.status === "Paid" ? "paid" : "pending_hfy_confirmation"}`}>{row.status}</span></td><td>{paidDate(row.paidAt)}</td></tr>)}</tbody></table></div></section> : null}
  </>;
}
