import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInvoiceDocumentSnapshot } from "../src/domain/invoice-document";
import { renderHtmlToPdf } from "../src/services/invoice-pdf/runtime";
import { renderInvoiceHtml } from "../src/services/invoice-pdf/template";

const serviceDefinitions = [
  ["2026-09-04", "Pool", "Pool", "2026-09-04T19:00:00.000Z", "2026-09-05T02:00:00.000Z"],
  ["2026-09-04", "Amigo Room", "Amigo Room", "2026-09-05T04:00:00.000Z", "2026-09-05T07:00:00.000Z"],
  ["2026-09-05", "Pool", "Pool", "2026-09-05T19:00:00.000Z", "2026-09-06T02:00:00.000Z"],
  ["2026-09-05", "Amigo Room", "Amigo Room", "2026-09-06T04:00:00.000Z", "2026-09-06T07:00:00.000Z"],
  ["2026-09-06", "Pool", "Pool", "2026-09-06T19:00:00.000Z", "2026-09-07T02:00:00.000Z"],
] as const;
const shifts = serviceDefinitions.map(([serviceDate, name, room, startsAt, endsAt], index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  name,
  serviceDate,
  room,
  startsAt: new Date(startsAt),
  endsAt: new Date(endsAt),
  clientRateCents: 10_000,
  billingStatus: "reviewed" as const,
  invoiceLinkIssue: false,
  invoiceLinkNote: "",
}));
const totalCents = shifts.reduce((sum, shift) => sum + Math.round((shift.endsAt.getTime() - shift.startsAt.getTime()) / 3_600_000 * shift.clientRateCents), 0);

const sharedResidency = {
  name: "Ace Hotel Palm Springs",
  timezone: "America/Los_Angeles",
  billingContactName: "Hotel Accounting",
  billingContactEmail: "accounting@example.com",
  billingAddress: "701 E Palm Canyon Dr\nPalm Springs, CA 92264",
  invoiceLinePresentation: "service_detail" as const,
};
const sharedIssuer = {
  name: "Hear For You",
  email: "billing@hearforyou.group",
  address: "",
  logo: null,
};

const scheduledSnapshot = createInvoiceDocumentSnapshot({
  invoice: {
    id: "00000000-0000-4000-8000-000000000100",
    number: "ACE-2026-0907",
    version: 1,
    invoiceDate: "2026-09-07",
    billingPeriodStart: "2026-09-01",
    billingPeriodEnd: "2026-09-07",
    paymentTermsDays: 7,
    totalCents,
    kind: "scheduled_period",
    notes: "Programming services for the weekend shown below.",
  },
  residency: sharedResidency,
  issuer: sharedIssuer,
  shifts,
  manualLines: [],
});

const customSnapshot = createInvoiceDocumentSnapshot({
  invoice: {
    id: "00000000-0000-4000-8000-000000000101",
    number: "ACE-2026-0915-C",
    version: 1,
    invoiceDate: "2026-09-15",
    billingPeriodStart: "2026-09-12",
    billingPeriodEnd: "2026-09-15",
    paymentTermsDays: 7,
    totalCents: 295_000,
    kind: "custom",
    notes: "Additional programming services approved by the hotel team.",
  },
  residency: sharedResidency,
  issuer: sharedIssuer,
  shifts: [],
  manualLines: [
    { type: "special_event", serviceDate: "2026-09-12", description: "Special event music programming", quantityThousandths: 1_000, unitLabel: "service", unitAmountCents: 250_000, totalCents: 250_000 },
    { type: "program_base_fee", serviceDate: null, description: "Equipment coordination", quantityThousandths: 3_000, unitLabel: "hour", unitAmountCents: 15_000, totalCents: 45_000 },
  ],
});

const outputDirectory = resolve("output/pdf");
await mkdir(outputDirectory, { recursive: true });
for (const [filename, snapshot] of [
  ["HFY-SAMPLE-INVOICE.pdf", scheduledSnapshot],
  ["HFY-SAMPLE-CUSTOM-INVOICE.pdf", customSnapshot],
] as const) {
  const outputPath = resolve(outputDirectory, filename);
  const pdf = await renderHtmlToPdf(renderInvoiceHtml(snapshot));
  await writeFile(outputPath, pdf);
  console.log(`Sample Invoice rendered (${pdf.length} bytes): ${outputPath}`);
}
