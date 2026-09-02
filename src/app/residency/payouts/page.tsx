import { formatTimeInput } from "@/components/format";
import { getResidencyClientPayoutStatus } from "@/data/residency-client";
import { canResidencyRoleAccess } from "@/domain/residency-access";
import { requireResidencyActor } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClientRateForm } from "./client-rate-form";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default async function ResidencyPayoutStatusPage() {
  const actor = await requireResidencyActor();
  if (!canResidencyRoleAccess(actor.accessRole, "payout_status")) redirect("/residency/calendar");
  if (!actor.clientPaymentStatusVisible) redirect("/residency/calendar");
  const rows = await getResidencyClientPayoutStatus(actor.residencyId);
  const owedTotalCents = rows.reduce((sum, row) => sum + (row.owedCents ?? 0), 0);
  return <>
    <header className="page-header client-page-header"><div><p className="eyebrow">Your money</p><h1>Payment Status</h1></div></header>
    <section className="card client-payment-panel"><header className="client-payment-section-heading"><div><h2>Your artists</h2><p className="subhead">Rates and totals for artists you manage in this Residency.</p></div><div className="client-owed-total client-payment-total"><span>Running total owed</span><strong>{money(owedTotalCents)}</strong></div></header><div className="table-wrap client-payout-table"><table><thead><tr><th>Artist</th><th>Date</th><th>Hours</th><th>Rate for this date</th><th>Owed</th></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.id}><td><strong>{row.artist}</strong></td><td>{row.serviceDate}</td><td>{formatTimeInput(new Date(row.startsAt), actor.residencyTimezone)}–{formatTimeInput(new Date(row.endsAt), actor.residencyTimezone)}</td><td><ClientRateForm assignmentId={row.id} defaultRateCents={row.defaultRateCents} overrideRateCents={row.overrideRateCents} /></td><td><strong>{row.owedCents === null ? "—" : money(row.owedCents)}</strong></td></tr>) : <tr><td colSpan={5}>No client-managed artist assignments yet.</td></tr>}</tbody></table></div></section>
  </>;
}
