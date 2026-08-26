import { addDays, calculateBillableAmountCents, hoursBetween } from "./airtable-parity";

export type InvoiceDocumentServiceLine = {
  source: "scheduled" | "custom";
  shiftId: string | null;
  serviceDate: string | null;
  description: string;
  room: string;
  timeRange: string;
  quantityThousandths: number;
  unitLabel: string;
  hoursThousandths: number | null;
  rateCents: number;
  amountCents: number;
};

export type InvoiceDocumentSnapshot = {
  schemaVersion: 1;
  invoice: {
    id: string;
    number: string;
    version: number;
    invoiceDate: string;
    dueDate: string;
    billingPeriodStart: string;
    billingPeriodEnd: string;
    paymentTerms: string;
    currency: "USD";
    totalCents: number;
    kind: "scheduled_period" | "custom";
    notes: string;
  };
  issuer: {
    name: string;
    email: string;
    addressLines: string[];
    logo: {
      storagePath: string;
      contentType: "image/png" | "image/jpeg" | "image/webp";
      sha256: string;
      byteSize: number;
    } | null;
  };
  billTo: {
    residencyName: string;
    contactName: string;
    contactEmail: string;
    addressLines: string[];
  };
  serviceTimezone: string;
  linePresentation: "service_detail" | "daily_summary" | "period_summary";
  serviceLines: InvoiceDocumentServiceLine[];
};

export type InvoiceDocumentSource = {
  invoice: {
    id: string;
    number: string;
    version: number;
    invoiceDate: string;
    billingPeriodStart: string;
    billingPeriodEnd: string;
    paymentTermsDays: number;
    totalCents: number;
    kind: "scheduled_period" | "custom";
    notes: string;
  };
  residency: {
    name: string;
    timezone: string;
    billingContactName: string;
    billingContactEmail: string;
    billingAddress: string;
    invoiceLinePresentation: "service_detail" | "daily_summary" | "period_summary";
  };
  issuer: {
    name: string;
    email: string;
    address: string;
    logo: {
      storagePath: string;
      contentType: "image/png" | "image/jpeg" | "image/webp";
      sha256: string;
      byteSize: number;
    } | null;
  };
  shifts: Array<{
    id: string;
    name: string;
    serviceDate: string;
    room: string;
    startsAt: Date;
    endsAt: Date;
    clientRateCents: number;
    billingStatus: "pending" | "reviewed" | "invoiced" | "not_billable";
    invoiceLinkIssue: boolean;
    invoiceLinkNote: string;
  }>;
  manualLines: Array<{
    type: "program_base_fee" | "overage" | "trial_add_on" | "talent_hours" | "talent_fixed_fee" | "manual_adjustment" | "special_event";
    serviceDate: string | null;
    description: string;
    quantityThousandths: number;
    unitLabel: string;
    unitAmountCents: number;
    totalCents: number;
  }>;
};

function splitAddress(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function formatTime(value: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

export function createInvoiceDocumentSnapshot(source: InvoiceDocumentSource): InvoiceDocumentSnapshot {
  if (!source.invoice.number.trim()) throw new Error("Invoice number is required before approval.");
  if (source.invoice.totalCents <= 0) throw new Error("Invoice total must be greater than zero before approval.");
  if (!source.residency.billingContactEmail.trim()) throw new Error("Billing contact email is required before approval.");
  if (source.invoice.kind === "scheduled_period" && !source.shifts.length) throw new Error("At least one scheduled Shift must be linked before approval.");
  if (source.invoice.kind === "custom" && !source.manualLines.length) throw new Error("At least one custom line item is required before approval.");

  const scheduledLines: InvoiceDocumentServiceLine[] = [...source.shifts]
    .sort((left, right) => left.serviceDate.localeCompare(right.serviceDate) || left.startsAt.getTime() - right.startsAt.getTime())
    .map((shift) => {
      if (shift.invoiceLinkIssue) {
        throw new Error(shift.invoiceLinkNote || `${shift.name} has an Invoice-link issue that must be resolved.`);
      }
      if (shift.billingStatus === "not_billable") throw new Error(`${shift.name} is marked not billable and cannot appear on this Invoice.`);
      if (shift.serviceDate < source.invoice.billingPeriodStart || shift.serviceDate > source.invoice.billingPeriodEnd) {
        throw new Error(`${shift.name} falls outside this Invoice's billing period.`);
      }
      if (shift.clientRateCents <= 0) throw new Error(`${shift.name} needs a client billing rate before approval.`);
      const hours = hoursBetween(shift.startsAt, shift.endsAt);
      if (hours <= 0) throw new Error(`${shift.name} needs a valid service time before approval.`);
      return {
        source: "scheduled" as const,
        shiftId: shift.id,
        serviceDate: shift.serviceDate,
        description: shift.name.trim(),
        room: shift.room.trim(),
        timeRange: `${formatTime(shift.startsAt, source.residency.timezone)} - ${formatTime(shift.endsAt, source.residency.timezone)}`,
        quantityThousandths: Math.round(hours * 1_000),
        unitLabel: "hour",
        hoursThousandths: Math.round(hours * 1_000),
        rateCents: shift.clientRateCents,
        amountCents: calculateBillableAmountCents(shift.startsAt, shift.endsAt, shift.clientRateCents),
      };
    });

  const manualLines: InvoiceDocumentServiceLine[] = source.manualLines.map((line) => {
    if (!line.description.trim()) throw new Error("Every custom Invoice line needs a description.");
    if (line.quantityThousandths <= 0) throw new Error(`${line.description} needs a quantity greater than zero.`);
    if (!line.unitLabel.trim()) throw new Error(`${line.description} needs a unit label.`);
    if (line.type !== "manual_adjustment" && (line.unitAmountCents < 0 || line.totalCents < 0)) {
      throw new Error(`${line.description} cannot have a negative amount.`);
    }
    const expectedTotal = Math.round((line.quantityThousandths * line.unitAmountCents) / 1_000);
    if (expectedTotal !== line.totalCents) throw new Error(`${line.description} has an invalid line total.`);
    return {
      source: "custom" as const,
      shiftId: null,
      serviceDate: line.serviceDate,
      description: line.description.trim(),
      room: "",
      timeRange: "",
      quantityThousandths: line.quantityThousandths,
      unitLabel: line.unitLabel.trim(),
      hoursThousandths: null,
      rateCents: line.unitAmountCents,
      amountCents: line.totalCents,
    };
  });

  const serviceLines = [...scheduledLines, ...manualLines].sort((left, right) => {
    if (left.serviceDate && right.serviceDate) return left.serviceDate.localeCompare(right.serviceDate);
    if (left.serviceDate) return -1;
    if (right.serviceDate) return 1;
    return 0;
  });

  const calculatedTotalCents = serviceLines.reduce((sum, line) => sum + line.amountCents, 0);
  if (calculatedTotalCents !== source.invoice.totalCents) {
    throw new Error("The Invoice total does not match its client line items. Resolve the Invoice variance before approval.");
  }

  return {
    schemaVersion: 1,
    invoice: {
      id: source.invoice.id,
      number: source.invoice.number,
      version: source.invoice.version,
      invoiceDate: source.invoice.invoiceDate,
      dueDate: addDays(source.invoice.invoiceDate, source.invoice.paymentTermsDays),
      billingPeriodStart: source.invoice.billingPeriodStart,
      billingPeriodEnd: source.invoice.billingPeriodEnd,
      paymentTerms: source.invoice.paymentTermsDays === 0 ? "Due on receipt" : `Net ${source.invoice.paymentTermsDays}`,
      currency: "USD",
      totalCents: source.invoice.totalCents,
      kind: source.invoice.kind,
      notes: source.invoice.notes.trim(),
    },
    issuer: {
      name: source.issuer.name.trim() || "Hear For You",
      email: source.issuer.email.trim() || "billing@hearforyou.group",
      addressLines: splitAddress(source.issuer.address),
      logo: source.issuer.logo,
    },
    billTo: {
      residencyName: source.residency.name,
      contactName: source.residency.billingContactName,
      contactEmail: source.residency.billingContactEmail,
      addressLines: splitAddress(source.residency.billingAddress),
    },
    serviceTimezone: source.residency.timezone,
    linePresentation: source.residency.invoiceLinePresentation,
    serviceLines,
  };
}
