import { describe, expect, it } from "vitest";
import { projectClientSafeInvoice } from "./client-safe-invoice";

describe("client-safe Invoice boundary", () => {
  it("drops internal financial and delivery fields even if a wider row reaches the projector", () => {
    const result = projectClientSafeInvoice({
      id: "invoice-1",
      invoiceNumber: "ACE-101",
      billingPeriodStart: "2026-08-01",
      billingPeriodEnd: "2026-08-03",
      invoiceDate: "2026-08-04",
      status: "sent",
      totalCents: 120000,
      sentAt: "2026-08-04T18:00:00.000Z",
      talentCostCents: 70000,
      grossMarginCents: 50000,
      pdfStoragePath: "private/path.pdf",
      billingContactEmail: "private@example.com",
      notes: "internal note",
    });
    expect(result).toEqual({
      id: "invoice-1",
      invoiceNumber: "ACE-101",
      billingPeriodStart: "2026-08-01",
      billingPeriodEnd: "2026-08-03",
      invoiceDate: "2026-08-04",
      status: "sent",
      totalCents: 120000,
      sentAt: "2026-08-04T18:00:00.000Z",
    });
    expect(result).not.toHaveProperty("talentCostCents");
    expect(result).not.toHaveProperty("grossMarginCents");
    expect(result).not.toHaveProperty("pdfStoragePath");
    expect(result).not.toHaveProperty("notes");
  });

  it("keeps a paid Invoice visible to the client", () => {
    expect(projectClientSafeInvoice({
      id: "invoice-paid",
      invoiceNumber: "ACE-100",
      billingPeriodStart: "2026-07-01",
      billingPeriodEnd: "2026-07-07",
      invoiceDate: "2026-07-08",
      status: "paid",
      totalCents: 90000,
      sentAt: "2026-07-08T18:00:00.000Z",
    }).status).toBe("paid");
  });
});
