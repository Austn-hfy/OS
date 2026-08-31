import { formatMoney } from "@/components/format";
import { PrivateValue } from "@/components/privacy-mode";
import { getPayoutQueue, getResidencyList } from "@/data/internal";
import { PayoutsWorkspace } from "./payouts-workspace";

export default async function PayoutsPage({ searchParams }: { searchParams: Promise<{ residency?: string }> }) {
  const { residency } = await searchParams;
  const [rows, residencies] = await Promise.all([getPayoutQueue(residency), getResidencyList()]);
  const selected = residencies.find((item) => item.id === residency);
  const readyRows = rows.filter((row) => row.payoutStatus === "ready_to_pay");
  const readyTotal = readyRows.reduce((sum, row) => sum + row.totalCompensationCents, 0);
  return <>
    <header className="page-header payout-page-header"><div><p className="eyebrow">{selected?.name ?? "HFY company"}</p><h1>Payouts</h1><p className="subhead"><strong><PrivateValue>{formatMoney(readyTotal)}</PrivateValue></strong> ready to pay across {readyRows.length} Assignment{readyRows.length === 1 ? "" : "s"}. Completed eligible work still enters this queue automatically.</p></div></header>
    <PayoutsWorkspace rows={rows} residencies={residencies} companyWide={!selected} />
  </>;
}
