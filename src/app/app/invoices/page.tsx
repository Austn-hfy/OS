import { formatDate, formatMoney, Status } from "@/components/format";
import { PrivateValue, PrivacyPdfLink } from "@/components/privacy-mode";
import { getInvoices, getInvoiceWorkspace, getResidencyList } from "@/data/internal";
import { retryInvoiceSendAction } from "./actions";
import { InvoiceApprovalButton } from "./invoice-approval-button";
import { InvoiceWorkspace } from "./invoice-workspace";

export const runtime = "nodejs";
export const maxDuration = 60;

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ residency?: string }> }) {
  const { residency } = await searchParams;
  const [rows, residencyList, workspace] = await Promise.all([
    getInvoices(residency),
    getResidencyList(),
    residency ? getInvoiceWorkspace(residency) : Promise.resolve(null),
  ]);
  const selected = residencyList.find((item) => item.id === residency);

  if (selected && workspace) {
    return <InvoiceWorkspace
      rows={rows.map((row) => ({
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        kind: row.kind,
        billingPeriodStart: row.billingPeriodStart,
        billingPeriodEnd: row.billingPeriodEnd,
        status: row.status,
        totalCents: row.totalCents,
        calculatedTotalCents: row.calculatedTotalCents,
        calculatedHours: row.calculatedHours,
        varianceCents: row.varianceCents,
        talentCostCents: row.talentCostCents,
        grossMarginCents: row.grossMarginCents,
        marginPercentage: row.marginPercentage,
        balanceCents: row.balanceCents,
        pdfStoragePath: row.pdfStoragePath,
        deliveryStatus: row.deliveryStatus,
        autoSendInvoices: row.autoSendInvoices,
        autoSendReason: row.autoSendReason,
      }))}
      residency={workspace.residency}
      eligibleShifts={workspace.eligibleShifts}
      defaultInvoiceNumber={workspace.defaultInvoiceNumber}
    />;
  }

  return <>
    <header className="page-header card"><div><p className="eyebrow">Company billing</p><h1>Invoices</h1><p className="subhead">Open a Residency to create an Invoice or configure its billing. This company view is for monitoring every program.</p></div></header>
    <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Residency</th><th>Type</th><th>Period</th><th>Client total</th><th>Talent cost</th><th>Gross margin</th><th>Status</th><th>Delivery</th><th>Action</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.invoiceNumber}</strong></td><td>{row.residencyName}</td><td>{row.kind === "custom" ? "Custom" : "Scheduled"}</td><td>{formatDate(row.billingPeriodStart)}–{formatDate(row.billingPeriodEnd)}</td><td><PrivateValue>{formatMoney(row.totalCents)}</PrivateValue></td><td><PrivateValue>{formatMoney(row.talentCostCents)}</PrivateValue></td><td><PrivateValue>{formatMoney(row.grossMarginCents)}</PrivateValue></td><td><Status value={row.status} /></td><td>{row.autoSendInvoices ? (row.deliveryStatus ? <Status value={row.deliveryStatus} /> : "Awaiting approval") : <Status value="manual" />}</td><td>{row.status === "draft" ? <InvoiceApprovalButton invoiceId={row.id} autoSend={row.autoSendInvoices} /> : null}{row.pdfStoragePath && row.status !== "draft" ? <PrivacyPdfLink className="button secondary" href={`/app/invoices/${row.id}/pdf`}>Download PDF</PrivacyPdfLink> : null}{row.status === "approved" && row.deliveryStatus === "failed" ? <form action={retryInvoiceSendAction}><input name="invoiceId" type="hidden" value={row.id} /><button className="button" type="submit">Retry send</button></form> : null}</td></tr>)}</tbody></table>{!rows.length ? <div className="empty">No Invoices yet.</div> : null}</div>
  </>;
}
