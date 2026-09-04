import { calculatePlatformMonthlyAmountCents, platformCadenceChargeCents, type PlatformBillingCadence } from "./platform-billing";

export type PlatformInvoiceDocumentSnapshot = {
  schemaVersion: 1;
  invoice: {
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
  issuer: {
    legalName: string;
    productName: string;
    email: string;
    addressLines: string[];
  };
  billTo: {
    residencyName: string;
    contactName: string;
    contactEmail: string;
    addressLines: string[];
  };
  committedPlan: {
    revision: number;
    cadence: PlatformBillingCadence;
    talentSessions: number;
    housePrograms: number;
    oneOffAllowance: number;
    unitAmountCents: number;
    monthlyAmountCents: number;
    cadenceAmountCents: number;
  };
  lines: Array<{
    description: string;
    quantity: number;
    unitAmountCents: number;
    amountCents: number;
  }>;
};

export type PlatformInvoiceDocumentSource = {
  invoice: PlatformInvoiceDocumentSnapshot["invoice"];
  issuer: Omit<PlatformInvoiceDocumentSnapshot["issuer"], "addressLines"> & { address: string };
  billTo: Omit<PlatformInvoiceDocumentSnapshot["billTo"], "addressLines"> & { address: string };
  committedPlan: Omit<PlatformInvoiceDocumentSnapshot["committedPlan"], "monthlyAmountCents" | "cadenceAmountCents">;
};

function splitAddress(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function createPlatformInvoiceDocumentSnapshot(source: PlatformInvoiceDocumentSource): PlatformInvoiceDocumentSnapshot {
  const { committedPlan } = source;
  const monthlyAmountCents = calculatePlatformMonthlyAmountCents({
    talentProgramSessions: committedPlan.talentSessions,
    housePrograms: committedPlan.housePrograms,
    unitAmountCents: committedPlan.unitAmountCents,
    talentSessionUnitAmountCents: committedPlan.unitAmountCents,
    houseProgramUnitAmountCents: committedPlan.unitAmountCents,
  });
  const cadenceAmountCents = platformCadenceChargeCents(monthlyAmountCents, committedPlan.cadence);
  const cadenceMonths = committedPlan.cadence === "monthly" ? 1 : committedPlan.cadence === "quarterly" ? 3 : 12;
  const lines = [
    {
      description: "Committed Talent sessions",
      quantity: committedPlan.talentSessions * cadenceMonths,
      unitAmountCents: committedPlan.unitAmountCents,
      amountCents: committedPlan.talentSessions * committedPlan.unitAmountCents * cadenceMonths,
    },
    {
      description: "Committed House programs",
      quantity: committedPlan.housePrograms * cadenceMonths,
      unitAmountCents: committedPlan.unitAmountCents,
      amountCents: committedPlan.housePrograms * committedPlan.unitAmountCents * cadenceMonths,
    },
  ].filter((line) => line.quantity > 0);

  if (source.invoice.currency !== "USD") throw new Error("Platform subscription invoices must use USD.");
  if (source.invoice.amountDueCents < 0 || source.invoice.amountPaidCents < 0) throw new Error("Platform invoice amounts cannot be negative.");
  if (source.invoice.billingPeriodEnd < source.invoice.billingPeriodStart) throw new Error("Platform invoice period is invalid.");

  return {
    schemaVersion: 1,
    invoice: source.invoice,
    issuer: { ...source.issuer, addressLines: splitAddress(source.issuer.address) },
    billTo: { ...source.billTo, addressLines: splitAddress(source.billTo.address) },
    committedPlan: { ...committedPlan, monthlyAmountCents, cadenceAmountCents },
    lines,
  };
}
