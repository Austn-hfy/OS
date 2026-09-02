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
  return <>
    <ResidencyPageHeader eyebrow={`${actor.residencyName} billing`} title="Payouts" />
    <p className="residency-page-summary"><strong>{money(owedTotalCents)}</strong> currently owed across {outstandingCount} client-managed Assignment{outstandingCount === 1 ? "" : "s"}. Rates can be overridden for an individual date.</p>
    <ClientPayoutsWorkspace rows={rows} residencyName={actor.residencyName} timeZone={actor.residencyTimezone} />
  </>;
}
