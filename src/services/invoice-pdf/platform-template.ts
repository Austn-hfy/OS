import type { PlatformInvoiceDocumentSnapshot } from "@/domain/platform-invoice-document";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function date(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00Z`));
}

function addressLines(lines: string[]) {
  return lines.map((line) => `<div>${escapeHtml(line)}</div>`).join("");
}

export function renderPlatformInvoiceHtml(snapshot: PlatformInvoiceDocumentSnapshot) {
  const cadenceLabel = snapshot.committedPlan.cadence === "annual" ? "Annual" : snapshot.committedPlan.cadence === "quarterly" ? "Quarterly" : "Monthly";
  const rows = snapshot.lines.map((line) => `<tr>
    <td><strong>${escapeHtml(line.description)}</strong><span>${cadenceLabel} committed plan · revision ${snapshot.committedPlan.revision}</span></td>
    <td class="numeric">${line.quantity}</td>
    <td class="numeric">${money(line.unitAmountCents)}</td>
    <td class="numeric amount">${money(line.amountCents)}</td>
  </tr>`).join("");
  const statusLabel = snapshot.invoice.status.replaceAll("_", " ");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Platform Subscription Invoice ${escapeHtml(snapshot.invoice.number)}</title>
    <style>
      @page { size: Letter; margin: 0; }
      * { box-sizing: border-box; }
      html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { margin: 0; color: #26323d; background: #eef5fb; font: 10.5pt/1.45 Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .page { position: relative; min-height: 11in; padding: .66in .7in .58in; background: radial-gradient(circle at 85% 5%, #d8edff 0, transparent 32%), linear-gradient(155deg, #f8fbff 0%, #fff 54%, #fff4f0 100%); }
      header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: .3in; border-bottom: 1px solid #b9cad8; }
      .brand { display: flex; align-items: center; gap: 13px; }
      .mark { display: grid; width: 48px; height: 48px; place-items: center; border: 1px solid #76acd5; border-radius: 16px; color: #164c74; background: rgba(255,255,255,.76); font-size: 17pt; font-weight: 800; }
      .product { font-size: 17pt; font-weight: 780; letter-spacing: -.03em; }
      .legal { color: #687b8a; font-size: 8.5pt; }
      .issuer-address { margin-top: 3px; color: #687b8a; font-size: 8pt; line-height: 1.3; }
      .invoice-label { color: #de6c55; font-size: 8.5pt; font-weight: 800; letter-spacing: .14em; text-align: right; text-transform: uppercase; }
      h1 { margin: 4px 0 0; font-size: 26pt; line-height: 1; letter-spacing: -.045em; }
      .summary { display: grid; grid-template-columns: 1fr 1fr; gap: .55in; padding: .36in 0 .34in; }
      .summary h2, .plan h2 { margin: 0 0 8px; color: #657a8b; font-size: 8pt; letter-spacing: .12em; text-transform: uppercase; }
      .summary p { margin: 2px 0; }
      .client { margin-bottom: 7px !important; font-size: 14pt; font-weight: 760; }
      dl { display: grid; grid-template-columns: auto auto; justify-content: end; gap: 5px 24px; margin: 0; text-align: right; }
      dt { color: #687b8a; } dd { margin: 0; font-weight: 700; }
      .status { color: ${snapshot.invoice.status === "paid" ? "#24735f" : snapshot.invoice.status === "open" ? "#b65542" : "#6c5a73"}; text-transform: capitalize; }
      .plan { display: grid; grid-template-columns: 1fr repeat(4, auto); gap: 20px; margin-bottom: 14px; padding: 14px 16px; border: 1px solid #cbd9e4; border-radius: 14px; background: rgba(255,255,255,.72); }
      .plan div:not(:first-child) { min-width: 76px; text-align: right; }
      .plan small { display: block; color: #718493; font-size: 7.5pt; text-transform: uppercase; }
      .plan strong { font-size: 12pt; }
      .table-shell { overflow: hidden; border: 1px solid #bed0dd; border-radius: 14px; background: rgba(255,255,255,.85); }
      table { width: 100%; border-collapse: collapse; }
      th { padding: 10px 13px; color: #5c7284; background: #e8f2f9; font-size: 8pt; letter-spacing: .08em; text-align: left; text-transform: uppercase; }
      td { padding: 13px; border-top: 1px solid #dde7ee; }
      td span { display: block; margin-top: 3px; color: #738694; font-size: 8.5pt; }
      .numeric { text-align: right; white-space: nowrap; } .amount { font-weight: 760; }
      .totals { display: flex; justify-content: flex-end; padding-top: .24in; }
      .total { min-width: 2.65in; padding: 17px 19px; border: 1px solid #f0b4a8; border-radius: 14px; background: #fff2ee; }
      .total div { display: flex; align-items: baseline; justify-content: space-between; gap: 22px; }
      .total span { color: #765d58; font-size: 9pt; font-weight: 700; text-transform: uppercase; }
      .total strong { font-size: 20pt; letter-spacing: -.035em; }
      .paid { margin-top: 5px; color: #687b8a; font-size: 8.5pt; text-align: right; }
      footer { position: absolute; right: .7in; bottom: .46in; left: .7in; display: flex; justify-content: space-between; padding-top: 10px; border-top: 1px solid #cfdae2; color: #748694; font-size: 8.5pt; }
    </style>
  </head>
  <body>
    <main class="page">
      <header>
        <div class="brand"><div class="mark">P</div><div><div class="product">${escapeHtml(snapshot.issuer.productName)}</div><div class="legal">Billed by ${escapeHtml(snapshot.issuer.legalName)} · ${escapeHtml(snapshot.issuer.email)}</div>${snapshot.issuer.addressLines.length ? `<div class="issuer-address">${addressLines(snapshot.issuer.addressLines)}</div>` : ""}</div></div>
        <div><div class="invoice-label">Platform Subscription Invoice</div><h1>${escapeHtml(snapshot.invoice.number)}</h1></div>
      </header>
      <section class="summary">
        <div><h2>Bill to</h2><p class="client">${escapeHtml(snapshot.billTo.residencyName)}</p>${snapshot.billTo.contactName ? `<p>${escapeHtml(snapshot.billTo.contactName)}</p>` : ""}<p>${escapeHtml(snapshot.billTo.contactEmail)}</p>${addressLines(snapshot.billTo.addressLines)}</div>
        <dl><dt>Invoice date</dt><dd>${date(snapshot.invoice.invoiceDate)}</dd><dt>Billing period</dt><dd>${date(snapshot.invoice.billingPeriodStart)} – ${date(snapshot.invoice.billingPeriodEnd)}</dd><dt>Cadence</dt><dd>${cadenceLabel}</dd><dt>Status</dt><dd class="status">${escapeHtml(statusLabel)}</dd></dl>
      </section>
      <section class="plan"><div><h2>Committed plan</h2><strong>${money(snapshot.committedPlan.monthlyAmountCents)} monthly equivalent</strong></div><div><small>Talent</small><strong>${snapshot.committedPlan.talentSessions}</strong></div><div><small>House</small><strong>${snapshot.committedPlan.housePrograms}</strong></div><div><small>One-offs included</small><strong>${snapshot.committedPlan.oneOffAllowance}</strong></div><div><small>Per unit</small><strong>${money(snapshot.committedPlan.unitAmountCents)}</strong></div></section>
      <section class="table-shell"><table><thead><tr><th>Subscription item</th><th class="numeric">Quantity</th><th class="numeric">Rate</th><th class="numeric">Amount</th></tr></thead><tbody>${rows || `<tr><td colspan="4">No committed billable units in this period.</td></tr>`}</tbody></table></section>
      <div class="totals"><div><div class="total"><div><span>Total due</span><strong>${money(snapshot.invoice.amountDueCents)}</strong></div></div><div class="paid">Paid ${money(snapshot.invoice.amountPaidCents)}</div></div></div>
      <footer><span>Platform subscription · separate from HFY talent services</span><span>Stripe reference ${escapeHtml(snapshot.invoice.stripeInvoiceId)}</span></footer>
    </main>
  </body>
</html>`;
}
