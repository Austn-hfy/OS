import Link from "next/link";
import { redirect } from "next/navigation";
import { ResidencyPageHeader } from "@/components/residency-page-header";
import { WorkspaceSurface } from "@/components/workspace-surface";
import { getResidencyClientFinances } from "@/data/residency-client";
import { canResidencyRoleAccess } from "@/domain/residency-access";
import { requireResidencyActor } from "@/lib/auth";
import { ClientTalentFinances } from "./client-talent-finances";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function date(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00Z`));
}

export default async function ResidencyFinancesPage() {
  const actor = await requireResidencyActor();
  if (!canResidencyRoleAccess(actor.accessRole, "finances")) redirect("/residency/calendar");
  const finances = await getResidencyClientFinances(actor.residencyId);
  const owedToHfyCents = finances.talentInvoices
    .filter((invoice) => invoice.status !== "paid")
    .reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const owedToTalentCents = finances.clientTalent.reduce((sum, row) => sum + (row.owedCents ?? 0), 0);

  return <WorkspaceSurface className="residency-workspace-surface workspace-surface-finances">
    <ResidencyPageHeader eyebrow={`${actor.residencyName} finances`} title="Finances" />
    <div className="finance-accordions">
      <details className="finance-accordion card" open>
        <summary><span><small>Directly sourced by your team</small><strong>Owed to Your Talent</strong></span><span><strong>{money(owedToTalentCents)}</strong><small>informational only</small></span></summary>
        <div className="finance-accordion-body">
          <p>This is a summary of what your Residency pays its own talent directly. HFY does not collect, send, or manage these payments.</p>
          <ClientTalentFinances rows={finances.clientTalent} timeZone={actor.residencyTimezone} canManage={actor.accessRole === "manager" && actor.residencyTier !== "complete"} />
        </div>
      </details>

      {finances.hasHfyManagedTalentActivity ? <details className="finance-accordion card" open>
        <summary><span><small>HFY-managed programming</small><strong>Owed to HFY</strong></span><span><strong>{money(owedToHfyCents)}</strong><small>outstanding</small></span></summary>
        <div className="finance-accordion-body">
          <p>Invoices for talent sourced, scheduled, and paid by HFY. Your Platform subscription is managed separately in Settings → Billing.</p>
          {finances.talentInvoices.length ? <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Invoice date</th><th>Service month</th><th>Amount</th><th>Status</th><th>Document</th></tr></thead><tbody>{finances.talentInvoices.map((invoice) => <tr key={invoice.id}><td><strong>{invoice.invoiceNumber}</strong></td><td>{date(invoice.invoiceDate)}</td><td>{date(invoice.billingPeriodStart)}–{date(invoice.billingPeriodEnd)}</td><td>{money(invoice.totalCents)}</td><td><span className={`status ${invoice.status}`}>{invoice.status}</span></td><td><Link className="button secondary" href={`/residency/invoices/${invoice.id}/pdf`}>Download PDF</Link></td></tr>)}</tbody></table></div> : <div className="empty">HFY-managed activity is scheduled, but no client-visible talent invoice has been issued yet.</div>}
        </div>
      </details> : null}

    </div>
  </WorkspaceSurface>;
}
