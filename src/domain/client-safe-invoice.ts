export type ClientSafeInvoice = {
  id: string;
  invoiceNumber: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  invoiceDate: string;
  status: "approved" | "sent";
  totalCents: number;
  sentAt: string | null;
};

type ClientSafeInvoiceSource = Omit<ClientSafeInvoice, "status"> & { status: string } & Record<string, unknown>;

export function projectClientSafeInvoice(row: ClientSafeInvoiceSource): ClientSafeInvoice {
  if (row.status !== "approved" && row.status !== "sent") throw new Error("Only approved or sent Invoices are client-visible.");
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    billingPeriodStart: row.billingPeriodStart,
    billingPeriodEnd: row.billingPeriodEnd,
    invoiceDate: row.invoiceDate,
    status: row.status,
    totalCents: row.totalCents,
    sentAt: row.sentAt,
  };
}
