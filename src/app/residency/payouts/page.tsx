import { formatTimeInput } from "@/components/format";
import { getResidencyClientPayoutStatus } from "@/data/residency-client";
import { canResidencyRoleAccess } from "@/domain/residency-access";
import { requireResidencyActor } from "@/lib/auth";
import { redirect } from "next/navigation";

function paidDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export default async function ResidencyPayoutStatusPage() {
  const actor = await requireResidencyActor();
  if (!canResidencyRoleAccess(actor.accessRole, "payout_status")) redirect("/residency/calendar");
  const rows = await getResidencyClientPayoutStatus(actor.residencyId);
  return <>
    <header className="page-header card"><div><p className="eyebrow">Residency view</p><h1>Payout status</h1><p className="subhead">Payment status only. Talent rates and payout amounts are not included.</p></div></header>
    <div className="table-wrap client-payout-table"><table><thead><tr><th>DJ</th><th>Scheduled date</th><th>Hours</th><th>Status</th><th>Paid date</th></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.id}><td><strong>{row.artist}</strong></td><td>{row.serviceDate}</td><td>{formatTimeInput(new Date(row.startsAt), actor.residencyTimezone)}–{formatTimeInput(new Date(row.endsAt), actor.residencyTimezone)}</td><td><span className={`status ${row.status === "Paid" ? "paid" : "pending_hfy_confirmation"}`}>{row.status}</span></td><td>{paidDate(row.paidAt)}</td></tr>) : <tr><td colSpan={5}>No scheduled payout statuses yet.</td></tr>}</tbody></table></div>
  </>;
}
