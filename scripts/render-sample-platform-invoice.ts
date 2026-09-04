import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createPlatformInvoiceDocumentSnapshot } from "../src/domain/platform-invoice-document";
import { renderHtmlToPdf } from "../src/services/invoice-pdf/runtime";
import { renderPlatformInvoiceHtml } from "../src/services/invoice-pdf/platform-template";

const snapshot = createPlatformInvoiceDocumentSnapshot({
  invoice: {
    id: "00000000-0000-4000-8000-000000000200",
    stripeInvoiceId: "in_test_platform_sample",
    number: "PLATFORM-TEST-1001",
    invoiceDate: "2026-09-01",
    billingPeriodStart: "2026-09-01",
    billingPeriodEnd: "2026-09-30",
    currency: "USD",
    amountDueCents: 27_500,
    amountPaidCents: 27_500,
    status: "paid",
  },
  issuer: {
    legalName: "HFY LLC",
    productName: "Platform",
    email: "billing@hearforyou.group",
    address: process.env.PLATFORM_BILLING_ADDRESS || "69365 El Canto Rd\nCathedral City, CA 92234",
  },
  billTo: {
    residencyName: "Sample Hotel — Stripe Test Mode",
    contactName: "Hotel Accounting",
    contactEmail: "accounting@example.test",
    address: "1 Test Way\nPalm Springs, CA 92264",
  },
  committedPlan: {
    revision: 2,
    cadence: "monthly",
    talentSessions: 8,
    housePrograms: 3,
    oneOffAllowance: 2,
    unitAmountCents: 2_500,
  },
});

const outputDirectory = resolve("output/pdf");
await mkdir(outputDirectory, { recursive: true });
const outputPath = resolve(outputDirectory, "HFY-SAMPLE-PLATFORM-INVOICE.pdf");
const pdf = await renderHtmlToPdf(renderPlatformInvoiceHtml(snapshot));
await writeFile(outputPath, pdf);
console.log(`Sample Platform Invoice rendered (${pdf.length} bytes): ${outputPath}`);
