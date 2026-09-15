import { effectiveCompedPlan } from "./comped-residency";
import {
  calculatePlatformPlanAmounts,
  PLATFORM_ANNUAL_BILLING_MONTHS,
  type PlatformSubscriptionTerm,
} from "./platform-billing";

type InvoiceIdentity = {
  id: string;
  stripeInvoiceId: string;
  number: string;
  invoiceDate: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  currency: "USD";
  amountDueCents: number;
  amountPaidCents: number;
  status: "open" | "paid" | "void" | "uncollectible";
};

type InvoiceParty = { legalName: string; productName: string; email: string; addressLines: string[] };
type BillTo = { residencyName: string; contactName: string; contactEmail: string; addressLines: string[] };
type InvoiceLine = { description: string; quantity: number; unitAmountCents: number; amountCents: number; detail?: string };

export type LegacyPlatformInvoiceDocumentSnapshot = {
  schemaVersion: 3;
  invoice: InvoiceIdentity;
  issuer: InvoiceParty;
  billTo: BillTo;
  committedPlan: {
    revision: number;
    cadence: "monthly" | "quarterly" | "annual";
    talentSessions: number;
    talentSessionUnitAmountCents: number;
    housePrograms: number;
    houseProgramUnitAmountCents: number;
    oneOffAllowance: number;
    monthlyAmountCents: number;
    cadenceAmountCents: number;
  };
  lines: InvoiceLine[];
};

export type PlatformInvoiceDocumentSnapshotV4 = {
  schemaVersion: 4;
  invoice: InvoiceIdentity;
  issuer: InvoiceParty;
  billTo: BillTo;
  committedPlan: {
    revision: number;
    term: PlatformSubscriptionTerm;
    talentBucketSize: number;
    houseBucketSize: number;
    slotUnitAmountCents: number;
    baseMonthlyAmountCents: number;
    effectiveMonthlyAmountCents: number;
    termChargeAmountCents: number;
    annualDiscountCents: number;
  };
  lines: InvoiceLine[];
};

export type PlatformInvoiceDocumentSnapshot = LegacyPlatformInvoiceDocumentSnapshot | PlatformInvoiceDocumentSnapshotV4;

export type PlatformInvoiceDocumentSource = {
  comped?: boolean;
  invoice: InvoiceIdentity;
  issuer: Omit<InvoiceParty, "addressLines"> & { address: string };
  billTo: Omit<BillTo, "addressLines"> & { address: string };
  committedPlan: {
    revision: number;
    term: PlatformSubscriptionTerm;
    talentBucketSize: number;
    houseBucketSize: number;
    slotUnitAmountCents: number;
  };
};

function splitAddress(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function createPlatformInvoiceDocumentSnapshot(source: PlatformInvoiceDocumentSource): PlatformInvoiceDocumentSnapshotV4 {
  const comped = source.comped ?? false;
  const amounts = calculatePlatformPlanAmounts(source.committedPlan, comped);
  const committedPlan = effectiveCompedPlan(source.committedPlan, comped);
  const termMonths = committedPlan.term === "annual" ? PLATFORM_ANNUAL_BILLING_MONTHS : 1;
  const lines: InvoiceLine[] = [
    {
      description: "Talent bucket",
      quantity: committedPlan.talentBucketSize * termMonths,
      unitAmountCents: committedPlan.slotUnitAmountCents,
      amountCents: committedPlan.talentBucketSize * committedPlan.slotUnitAmountCents * termMonths,
    },
    {
      description: "House bucket",
      quantity: committedPlan.houseBucketSize * termMonths,
      unitAmountCents: committedPlan.slotUnitAmountCents,
      amountCents: committedPlan.houseBucketSize * committedPlan.slotUnitAmountCents * termMonths,
    },
  ];
  if (amounts.annualDiscountCents > 0) {
    lines.push({
      description: "Annual prepayment discount (25%)",
      quantity: 1,
      unitAmountCents: -amounts.annualDiscountCents,
      amountCents: -amounts.annualDiscountCents,
      detail: "25% off the full month-to-month total for paying annually upfront",
    });
  }

  if (source.invoice.currency !== "USD") throw new Error("Platform subscription invoices must use USD.");
  if (source.invoice.amountDueCents < 0 || source.invoice.amountPaidCents < 0) throw new Error("Platform invoice amounts cannot be negative.");
  if (source.invoice.billingPeriodEnd < source.invoice.billingPeriodStart) throw new Error("Platform invoice period is invalid.");

  return {
    schemaVersion: 4,
    invoice: source.invoice,
    issuer: { ...source.issuer, addressLines: splitAddress(source.issuer.address) },
    billTo: { ...source.billTo, addressLines: splitAddress(source.billTo.address) },
    committedPlan: { ...committedPlan, ...amounts },
    lines,
  };
}
