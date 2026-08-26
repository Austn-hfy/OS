import { describe, expect, it } from "vitest";
import { createInvoiceDocumentSnapshot, type InvoiceDocumentSource } from "../src/domain/invoice-document";
import { renderInvoiceHtml } from "../src/services/invoice-pdf/template";

function source(overrides: Partial<InvoiceDocumentSource> = {}): InvoiceDocumentSource {
  return {
    invoice: {
      id: "00000000-0000-4000-8000-000000000100",
      number: "HFY-001",
      version: 1,
      invoiceDate: "2026-09-07",
      billingPeriodStart: "2026-09-01",
      billingPeriodEnd: "2026-09-07",
      paymentTermsDays: 7,
      totalCents: 70_000,
      kind: "scheduled_period",
      notes: "Thank you.",
    },
    residency: {
      name: "Hotel A",
      timezone: "America/Los_Angeles",
      billingContactName: "Accounts Payable",
      billingContactEmail: "ap@hotel.example",
      billingAddress: "1 Hotel Way\nPalm Springs, CA 92264",
      invoiceLinePresentation: "service_detail",
    },
    issuer: { name: "Hear For You", email: "billing@hearforyou.group", address: "", logo: null },
    shifts: [{
      id: "00000000-0000-4000-8000-000000000200",
      name: "Pool",
      serviceDate: "2026-09-04",
      room: "Pool Deck",
      startsAt: new Date("2026-09-04T19:00:00.000Z"),
      endsAt: new Date("2026-09-05T02:00:00.000Z"),
      clientRateCents: 10_000,
      billingStatus: "reviewed",
      invoiceLinkIssue: false,
      invoiceLinkNote: "",
    }],
    manualLines: [],
    ...overrides,
  };
}

describe("client Invoice document snapshot", () => {
  it("freezes scheduled service hours and client charges only", () => {
    const snapshot = createInvoiceDocumentSnapshot(source());
    expect(snapshot.invoice).toMatchObject({ number: "HFY-001", totalCents: 70_000, dueDate: "2026-09-14" });
    expect(snapshot.serviceLines).toEqual([expect.objectContaining({
      description: "Pool",
      room: "Pool Deck",
      timeRange: "12:00 PM - 7:00 PM",
      hoursThousandths: 7_000,
      rateCents: 10_000,
      amountCents: 70_000,
    })]);
    const serialized = JSON.stringify(snapshot).toLowerCase();
    for (const forbidden of ["talent", "artist", "grossmargin", "payout", "compensation", "zelle", "peerreview"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("blocks approval when the scheduled charges do not match the approved total", () => {
    const input = source();
    input.invoice.totalCents = 69_999;
    expect(() => createInvoiceDocumentSnapshot(input)).toThrow(/variance/i);
  });

  it("blocks missing, unbillable, and broken Shift inputs", () => {
    expect(() => createInvoiceDocumentSnapshot(source({ shifts: [] }))).toThrow(/at least one scheduled shift/i);
    const unbillable = source();
    unbillable.shifts[0].billingStatus = "not_billable";
    expect(() => createInvoiceDocumentSnapshot(unbillable)).toThrow(/not billable/i);
    const brokenLink = source();
    brokenLink.shifts[0].invoiceLinkIssue = true;
    brokenLink.shifts[0].invoiceLinkNote = "Review the covering period.";
    expect(() => createInvoiceDocumentSnapshot(brokenLink)).toThrow(/covering period/i);
  });

  it("renders a client-safe, escaped Invoice template", () => {
    const input = source();
    input.residency.name = "Hotel <script>alert(1)</script>";
    const html = renderInvoiceHtml(createInvoiceDocumentSnapshot(input));
    expect(html).toContain("Hotel &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("Hotel <script>");
    expect(html).toContain("Scheduled services");
    expect(html).not.toMatch(/talent cost|gross margin|payout|zelle|peer review/i);
  });

  it("groups multiple services under one date with a daily subtotal", () => {
    const input = source();
    input.shifts.push({
      ...input.shifts[0],
      id: "00000000-0000-4000-8000-000000000201",
      name: "Amigo Room",
      room: "Amigo Room",
      startsAt: new Date("2026-09-05T04:00:00.000Z"),
      endsAt: new Date("2026-09-05T07:00:00.000Z"),
    });
    input.invoice.totalCents = 100_000;
    const html = renderInvoiceHtml(createInvoiceDocumentSnapshot(input));
    expect(html.match(/Friday, September 4, 2026/g)).toHaveLength(1);
    expect(html).toContain("Daily subtotal $1,000.00");
    expect(html).toContain("Pool");
    expect(html).toContain("Amigo Room");
    expect(html).not.toContain("<th>Date</th>");
  });

  it("supports a fully custom client Invoice without linking scheduled Shifts", () => {
    const input = source();
    input.invoice.kind = "custom";
    input.invoice.totalCents = 125_000;
    input.shifts = [];
    input.manualLines = [{
      type: "special_event",
      serviceDate: "2026-09-04",
      description: "Special event programming",
      quantityThousandths: 1_000,
      unitLabel: "service",
      unitAmountCents: 125_000,
      totalCents: 125_000,
    }];
    const snapshot = createInvoiceDocumentSnapshot(input);
    expect(snapshot.serviceLines).toEqual([expect.objectContaining({ source: "custom", shiftId: null, amountCents: 125_000 })]);
    const html = renderInvoiceHtml(snapshot);
    expect(html).toContain("Invoice items");
    expect(html).toContain("Special event programming");
    expect(html).not.toMatch(/talent cost|gross margin|payout/i);
  });

  it("requires custom line items and preserves the Residency presentation choice", () => {
    const input = source();
    input.invoice.kind = "custom";
    input.shifts = [];
    input.invoice.totalCents = 100;
    expect(() => createInvoiceDocumentSnapshot(input)).toThrow(/at least one custom line/i);

    const daily = source();
    daily.residency.invoiceLinePresentation = "daily_summary";
    expect(createInvoiceDocumentSnapshot(daily).linePresentation).toBe("daily_summary");
  });
});
