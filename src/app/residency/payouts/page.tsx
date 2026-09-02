import { getResidencyClientPayoutStatus } from "@/data/residency-client";
import { ResidencyPageHeader } from "@/components/residency-page-header";
import { canResidencyRoleAccess } from "@/domain/residency-access";
import { requireResidencyActor } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClientPayoutsWorkspace } from "./client-payouts-workspace";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default async function ResidencyPayoutStatusPage() {
  const actor = await requireResidencyActor();
  if (!canResidencyRoleAccess(actor.accessRole, "payout_status")) redirect("/residency/calendar");
  if (!actor.clientPaymentStatusVisible) redirect("/residency/calendar");
  const rows = await getResidencyClientPayoutStatus(actor.residencyId);
  const owedTotalCents = rows.reduce((sum, row) => sum + (row.owedCents ?? 0), 0);
  const outstandingCount = rows.filter((row) => row.owedCents !== null && row.owedCents > 0).length;
  return <section className="residency-workspace-surface residency-payout-workspace-surface">
    <ResidencyPageHeader eyebrow={`${actor.residencyName} billing`} title="Payouts">
      <div className="residency-payout-heading-total"><strong>{money(owedTotalCents)} owed</strong><span>{outstandingCount} client-managed Assignment{outstandingCount === 1 ? "" : "s"} outstanding</span></div>
    </ResidencyPageHeader>
    <ClientPayoutsWorkspace rows={rows} residencyName={actor.residencyName} timeZone={actor.residencyTimezone} />
  </section>;
}
