import Link from "next/link";
import { redirect } from "next/navigation";
import { ResidencyPageHeader } from "@/components/residency-page-header";
import { getResidencyClientInvoices } from "@/data/residency-client";
import { canResidencyRoleAccess } from "@/domain/residency-access";
import { requireResidencyActor } from "@/lib/auth";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default async function ResidencyInvoicesPage() {
  const actor = await requireResidencyActor();
  if (!canResidencyRoleAccess(actor.accessRole, "invoices")) redirect("/residency/calendar");
  const rows = await getResidencyClientInvoices(actor.residencyId);
  return <>
    <ResidencyPageHeader eyebrow="Residency billing" title="Invoices" />
    <div className="table-wrap client-invoice-table"><table><thead><tr><th>Invoice</th><th>Invoice date</th><th>Period</th><th>Amount billed</th><th>Status</th><th>Document</th></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.id}><td><strong>{row.invoiceNumber}</strong></td><td>{row.invoiceDate}</td><td>{row.billingPeriodStart}–{row.billingPeriodEnd}</td><td>{money(row.totalCents)}</td><td><span className={`status ${row.status}`}>{row.status}</span></td><td><Link className="button secondary" href={`/residency/invoices/${row.id}/pdf`}>Download PDF</Link></td></tr>) : <tr><td colSpan={6}>No client-visible invoices yet.</td></tr>}</tbody></table></div>
  </>;
}
