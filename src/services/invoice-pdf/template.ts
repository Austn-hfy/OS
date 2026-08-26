import type { InvoiceDocumentSnapshot } from "@/domain/invoice-document";

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
    .format(new Date(`${value}T12:00:00.000Z`));
}

function serviceDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00.000Z`));
}

function hours(thousandths: number) {
  const value = thousandths / 1_000;
  return `${value.toFixed(Number.isInteger(value) ? 1 : 2)} hrs`;
}

function quantity(thousandths: number, unitLabel: string) {
  const value = thousandths / 1_000;
  const label = Math.abs(value) === 1 ? unitLabel : `${unitLabel}s`;
  return `${value.toFixed(Number.isInteger(value) ? 0 : 2)} ${label}`;
}

function addressLines(lines: string[]) {
  return lines.map((line) => `<div>${escapeHtml(line)}</div>`).join("");
}

export function renderInvoiceHtml(snapshot: InvoiceDocumentSnapshot, options: { logoDataUrl?: string | null } = {}) {
  type DisplayLine = InvoiceDocumentSnapshot["serviceLines"][number] & { rateDisplayCents: number | null };
  const scheduled = snapshot.serviceLines.filter((line) => line.source === "scheduled");
  const custom = snapshot.serviceLines.filter((line) => line.source === "custom");
  let displayLines: DisplayLine[] = snapshot.serviceLines.map((line) => ({ ...line, rateDisplayCents: line.rateCents }));

  if (snapshot.linePresentation === "daily_summary" && scheduled.length) {
    const scheduledByDate = new Map<string, typeof scheduled>();
    for (const line of scheduled) {
      if (!line.serviceDate) continue;
      scheduledByDate.set(line.serviceDate, [...(scheduledByDate.get(line.serviceDate) ?? []), line]);
    }
    const dailyLines = [...scheduledByDate.entries()].map(([serviceDateValue, lines]): DisplayLine => {
      const rates = new Set(lines.map((line) => line.rateCents));
      return {
        source: "scheduled",
        shiftId: null,
        serviceDate: serviceDateValue,
        description: [...new Set(lines.map((line) => line.description))].join(" + "),
        room: "",
        timeRange: `${lines.length} scheduled service${lines.length === 1 ? "" : "s"}`,
        quantityThousandths: lines.reduce((sum, line) => sum + (line.hoursThousandths ?? 0), 0),
        unitLabel: "hour",
        hoursThousandths: lines.reduce((sum, line) => sum + (line.hoursThousandths ?? 0), 0),
        rateCents: rates.size === 1 ? lines[0].rateCents : 0,
        rateDisplayCents: rates.size === 1 ? lines[0].rateCents : null,
        amountCents: lines.reduce((sum, line) => sum + line.amountCents, 0),
      };
    });
    displayLines = [...dailyLines, ...custom.map((line) => ({ ...line, rateDisplayCents: line.rateCents }))];
  }

  if (snapshot.linePresentation === "period_summary" && scheduled.length) {
    const rates = new Set(scheduled.map((line) => line.rateCents));
    const serviceDays = new Set(scheduled.map((line) => line.serviceDate).filter(Boolean)).size;
    const totalHours = scheduled.reduce((sum, line) => sum + (line.hoursThousandths ?? 0), 0);
    displayLines = [{
      source: "scheduled",
      shiftId: null,
      serviceDate: null,
      description: "Scheduled programming services",
      room: "",
      timeRange: `${serviceDays} service day${serviceDays === 1 ? "" : "s"} · ${scheduled.length} service${scheduled.length === 1 ? "" : "s"}`,
      quantityThousandths: totalHours,
      unitLabel: "hour",
      hoursThousandths: totalHours,
      rateCents: rates.size === 1 ? scheduled[0].rateCents : 0,
      rateDisplayCents: rates.size === 1 ? scheduled[0].rateCents : null,
      amountCents: scheduled.reduce((sum, line) => sum + line.amountCents, 0),
    }, ...custom.map((line) => ({ ...line, rateDisplayCents: line.rateCents }))];
  }

  const groupedLines = new Map<string, DisplayLine[]>();
  for (const line of displayLines) {
    const key = line.serviceDate ?? "__additional";
    groupedLines.set(key, [...(groupedLines.get(key) ?? []), line]);
  }
  const serviceRows = [...groupedLines.entries()].map(([serviceDateValue, lines]) => {
    const dayTotal = lines.reduce((sum, line) => sum + line.amountCents, 0);
    const lineRows = lines.map((line) => {
      const roomLabel = line.room.trim().toLowerCase() === line.description.trim().toLowerCase() ? "" : line.room;
      const detail = [roomLabel, line.timeRange].filter(Boolean).join(" · ");
      const quantityLabel = line.source === "scheduled" && line.hoursThousandths !== null
        ? hours(line.hoursThousandths)
        : quantity(line.quantityThousandths, line.unitLabel);
      const rateLabel = line.rateDisplayCents === null
        ? "Mixed"
        : `${money(line.rateDisplayCents)}/${escapeHtml(line.unitLabel === "hour" ? "hr" : line.unitLabel)}`;
      return `
        <tr class="service-row">
          <td><strong>${escapeHtml(line.description)}</strong></td>
          <td>${detail ? escapeHtml(detail) : `<span>${line.source === "custom" ? "—" : "Scheduled services"}</span>`}</td>
          <td class="numeric">${escapeHtml(quantityLabel)}</td>
          <td class="numeric">${rateLabel}</td>
          <td class="numeric amount">${money(line.amountCents)}</td>
        </tr>`;
    }).join("");
    const heading = serviceDateValue === "__additional"
      ? snapshot.linePresentation === "period_summary" && lines.some((line) => line.source === "scheduled") ? "Billing period summary" : "Additional charges"
      : serviceDate(serviceDateValue);
    return `<tbody class="service-day">
      <tr class="service-day-heading"><th colspan="5"><div><strong>${heading}</strong><span>${serviceDateValue === "__additional" ? "Subtotal" : "Daily subtotal"} ${money(dayTotal)}</span></div></th></tr>
      ${lineRows}
    </tbody>`;
  }).join("");
  const datedDays = new Set(snapshot.serviceLines.map((line) => line.serviceDate).filter(Boolean)).size;
  const totalHoursThousandths = scheduled.reduce((sum, line) => sum + (line.hoursThousandths ?? 0), 0);
  const serviceSummary = snapshot.invoice.kind === "custom"
    ? `${custom.length} custom line item${custom.length === 1 ? "" : "s"}`
    : `${datedDays} service day${datedDays === 1 ? "" : "s"} · ${scheduled.length} scheduled service${scheduled.length === 1 ? "" : "s"} · ${hours(totalHoursThousandths)} total · Hotel local time`;
  const sectionTitle = snapshot.invoice.kind === "custom" ? "Invoice items" : "Scheduled services";
  const brandVisual = options.logoDataUrl
    ? `<img class="brand-logo" src="${escapeHtml(options.logoDataUrl)}" alt="">`
    : `<div class="brand-mark">HFY</div>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Invoice ${escapeHtml(snapshot.invoice.number)}</title>
    <style>
      @page { size: Letter; margin: 0; }
      * { box-sizing: border-box; }
      html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body {
        margin: 0;
        background: #f4f7f9;
        color: #102236;
        font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 10.5pt;
        line-height: 1.45;
      }
      .page { min-height: 11in; padding: 0.62in 0.68in 0.55in; background: linear-gradient(145deg, #f8fbfd 0%, #ffffff 46%, #fff8f6 100%); }
      .brand-row { display: flex; align-items: center; justify-content: space-between; padding-bottom: 0.28in; border-bottom: 1px solid #cfdae3; }
      .brand { display: flex; align-items: center; gap: 12px; }
      .brand-mark { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 13px; color: white; background: linear-gradient(145deg, #68b5e9, #247fcf); font-size: 14pt; font-weight: 800; letter-spacing: -0.04em; }
      .brand-logo { display: block; max-width: 132px; max-height: 52px; object-fit: contain; object-position: left center; }
      .brand-name { font-size: 16pt; font-weight: 750; letter-spacing: -0.025em; }
      .brand-email { color: #667b8f; font-size: 9pt; }
      .invoice-label { color: #247fcf; font-size: 9pt; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }
      h1 { margin: 3px 0 0; font-size: 28pt; line-height: 1; letter-spacing: -0.045em; }
      .summary { display: grid; grid-template-columns: 1fr 1fr; gap: 0.55in; padding: 0.34in 0 0.32in; }
      .summary h2 { margin: 0 0 8px; color: #526a7f; font-size: 8.5pt; letter-spacing: 0.12em; text-transform: uppercase; }
      .summary p { margin: 2px 0; }
      .client-name { margin-bottom: 6px !important; font-size: 14pt; font-weight: 750; letter-spacing: -0.02em; }
      .meta { display: grid; grid-template-columns: auto auto; justify-content: end; gap: 5px 24px; text-align: right; }
      .meta dt { color: #667b8f; }
      .meta dd { margin: 0; font-weight: 700; }
      .service-title { margin: 0 0 8px; font-size: 11pt; font-weight: 750; }
      .timezone { margin-left: 8px; color: #728598; font-size: 8.5pt; font-weight: 500; }
      .table-shell { overflow: hidden; border: 1px solid #c9d6e0; border-radius: 14px; background: rgba(255,255,255,0.84); }
      table { width: 100%; border-collapse: collapse; }
      thead th { padding: 9px 12px; color: #526a7f; background: #eaf1f6; font-size: 8pt; letter-spacing: 0.08em; text-align: left; text-transform: uppercase; }
      th.numeric, td.numeric { text-align: right; white-space: nowrap; }
      .service-day { break-inside: avoid; }
      .service-day-heading th { padding: 10px 12px; border-top: 1px solid #c9d6e0; background: #f5f9fc; text-align: left; }
      .service-day:first-of-type .service-day-heading th { border-top: 0; }
      .service-day-heading div { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
      .service-day-heading strong { font-size: 10pt; letter-spacing: -0.01em; }
      .service-day-heading span { color: #526a7f; font-size: 8.5pt; font-weight: 700; }
      td { padding: 10px 12px; border-top: 1px solid #e0e7ed; vertical-align: top; }
      td strong { display: block; }
      td span { display: block; margin-top: 2px; color: #667b8f; font-size: 8.5pt; }
      td.amount { font-weight: 750; }
      .totals { display: flex; justify-content: flex-end; padding-top: 0.22in; }
      .total-card { width: 2.65in; padding: 16px 18px; border: 1px solid #a9cbe4; border-radius: 14px; background: #edf7fd; }
      .total-row { display: flex; align-items: baseline; justify-content: space-between; gap: 20px; }
      .total-row span:first-child { color: #526a7f; font-size: 9pt; font-weight: 700; text-transform: uppercase; }
      .total-row strong { font-size: 20pt; letter-spacing: -0.035em; }
      .terms { margin-top: 8px; color: #667b8f; font-size: 8.5pt; text-align: right; }
      .invoice-note { max-width: 4.1in; margin: 14px 0 0; padding: 11px 13px; border: 1px solid #dbe4eb; border-radius: 10px; color: #526a7f; background: rgba(255,255,255,.62); font-size: 8.5pt; white-space: pre-line; }
      footer { position: absolute; right: 0.68in; bottom: 0.45in; left: 0.68in; display: flex; justify-content: space-between; padding-top: 10px; border-top: 1px solid #d4dee6; color: #728598; font-size: 8.5pt; }
      @media print { .page { break-after: page; } }
    </style>
  </head>
  <body>
    <main class="page">
      <header class="brand-row">
        <div class="brand">
          ${brandVisual}
          <div><div class="brand-name">${escapeHtml(snapshot.issuer.name)}</div><div class="brand-email">${escapeHtml(snapshot.issuer.email)}</div></div>
        </div>
        <div><div class="invoice-label">Invoice</div><h1>${escapeHtml(snapshot.invoice.number)}</h1></div>
      </header>

      <section class="summary">
        <div>
          <h2>Bill to</h2>
          <p class="client-name">${escapeHtml(snapshot.billTo.residencyName)}</p>
          ${snapshot.billTo.contactName ? `<p>${escapeHtml(snapshot.billTo.contactName)}</p>` : ""}
          <p>${escapeHtml(snapshot.billTo.contactEmail)}</p>
          ${addressLines(snapshot.billTo.addressLines)}
        </div>
        <dl class="meta">
          <dt>Invoice date</dt><dd>${date(snapshot.invoice.invoiceDate)}</dd>
          <dt>Billing period</dt><dd>${date(snapshot.invoice.billingPeriodStart)} - ${date(snapshot.invoice.billingPeriodEnd)}</dd>
          <dt>Payment terms</dt><dd>${escapeHtml(snapshot.invoice.paymentTerms)}</dd>
          <dt>Due date</dt><dd>${date(snapshot.invoice.dueDate)}</dd>
        </dl>
      </section>

      <section>
        <h2 class="service-title">${sectionTitle} <span class="timezone">${escapeHtml(serviceSummary)}</span></h2>
        <div class="table-shell">
          <table>
            <thead><tr><th>Service</th><th>Details</th><th class="numeric">Quantity</th><th class="numeric">Rate</th><th class="numeric">Amount</th></tr></thead>
            ${serviceRows}
          </table>
        </div>
        ${snapshot.invoice.notes ? `<div class="invoice-note">${escapeHtml(snapshot.invoice.notes)}</div>` : ""}
        <div class="totals">
          <div>
            <div class="total-card"><div class="total-row"><span>Total due</span><strong>${money(snapshot.invoice.totalCents)}</strong></div></div>
            <div class="terms">${escapeHtml(snapshot.invoice.paymentTerms)} · Due ${date(snapshot.invoice.dueDate)}</div>
          </div>
        </div>
      </section>

      <footer><span>Thank you for working with Hear For You.</span><span>Invoice ${escapeHtml(snapshot.invoice.number)} · Version ${snapshot.invoice.version}</span></footer>
    </main>
  </body>
</html>`;
}
