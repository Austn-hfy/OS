import { readFile } from "node:fs/promises";
import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { comparePlatformUsage, calculatePlatformMonthlyAmountCents, platformCadenceChargeCents, platformCadenceInterval } from "@/domain/platform-billing";
import { createPlatformInvoiceDocumentSnapshot } from "@/domain/platform-invoice-document";
import { assertPlatformBillingStaging, assertStripeTestConfiguration } from "@/domain/stripe-test-mode";
import { renderPlatformInvoiceHtml } from "@/services/invoice-pdf/platform-template";

const readSource = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

describe("Platform committed billing", () => {
  it("bills only locked Talent and House quantities at the committed unit rate", () => {
    const monthly = calculatePlatformMonthlyAmountCents({
      talentProgramSessions: 8,
      housePrograms: 3,
      oneOffAllowance: 99,
      talentSessionUnitAmountCents: 2_500,
      houseProgramUnitAmountCents: 2_500,
      unitAmountCents: 2_500,
    } as Parameters<typeof calculatePlatformMonthlyAmountCents>[0] & { oneOffAllowance: number });
    expect(monthly).toBe(27_500);
    expect(platformCadenceChargeCents(monthly, "quarterly")).toBe(82_500);
    expect(platformCadenceChargeCents(monthly, "annual")).toBe(330_000);
    expect(platformCadenceInterval("quarterly")).toEqual({ interval: "month", intervalCount: 3 });
  });

  it("compares Live Usage without mutating plan quantities or producing money", () => {
    const plan = { talentProgramSessions: 8, housePrograms: 3, oneOffAllowance: 2 };
    const comparison = comparePlatformUsage(plan, { talentSessions: 10, housePrograms: 2, oneOffs: 4 });
    expect(plan).toEqual({ talentProgramSessions: 8, housePrograms: 3, oneOffAllowance: 2 });
    expect(comparison).toMatchObject({ withinPlan: false, totalOverBy: 4 });
    expect(comparison.talentSessions.overBy).toBe(2);
    expect(comparison.oneOffs.overBy).toBe(2);
    expect(comparison.housePrograms.withinPlan).toBe(true);
  });
});

describe("Stripe staging safety", () => {
  const safe = {
    STRIPE_SECRET_KEY: "sk_test_example",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_example",
    NEXT_PUBLIC_APP_URL: "https://staging.hfy.app",
    VERCEL: "1",
    VERCEL_ENV: "preview",
  };

  it("accepts test keys only in staging", () => {
    expect(assertStripeTestConfiguration(safe)).toEqual({ secretKey: "sk_test_example", publishableKey: "pk_test_example" });
  });

  it("rejects non-test keys and production before Stripe can be called", () => {
    expect(() => assertStripeTestConfiguration({ ...safe, STRIPE_SECRET_KEY: "sk_example" })).toThrow(/TEST MODE/);
    expect(() => assertStripeTestConfiguration({ ...safe, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_example" })).toThrow(/TEST MODE/);
    expect(() => assertStripeTestConfiguration({ ...safe, VERCEL_ENV: "production" })).toThrow(/staging-only/);
    expect(() => assertStripeTestConfiguration({ ...safe, VERCEL_ENV: "development", NEXT_PUBLIC_APP_URL: "https://hfy.app" })).toThrow(/staging deployment/);
    expect(() => assertPlatformBillingStaging({ VERCEL: "1", VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "https://hfy.app" })).toThrow(/staging-only/);
  });

  it("verifies raw signed webhooks, rejects live events, and updates the existing subscription", async () => {
    const [webhookRoute, webhookService, stripeService] = await Promise.all([
      readSource("../src/app/api/stripe/webhook/route.ts"),
      readSource("../src/services/platform-stripe-webhooks.ts"),
      readSource("../src/services/platform-stripe.ts"),
    ]);
    expect(webhookRoute).toContain("request.text()");
    expect(webhookRoute).toContain("webhooks.constructEvent");
    expect(webhookRoute).toContain("event.livemode");
    expect(webhookService).toContain("onConflictDoNothing()");
    expect(stripeService).toContain("stripe.subscriptions.update(subscription.id");
    expect(stripeService).toContain('proration_behavior: "none"');
    expect(stripeService).not.toContain("subscriptions.create");
  });

  it("accepts an intact Stripe test signature and rejects a tampered body", () => {
    const stripe = new Stripe("sk_test_fixture");
    const secret = "whsec_platform_billing_fixture";
    const payload = JSON.stringify({ id: "evt_test_fixture", object: "event", livemode: false, type: "invoice.paid", data: { object: { id: "in_test_fixture" } } });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(stripe.webhooks.constructEvent(payload, signature, secret).id).toBe("evt_test_fixture");
    expect(() => stripe.webhooks.constructEvent(`${payload} `, signature, secret)).toThrow(/signature/i);
  });
});

describe("Platform Invoice document", () => {
  it("uses a distinct subscription template and escapes client content", () => {
    const snapshot = createPlatformInvoiceDocumentSnapshot({
      invoice: { id: "invoice", stripeInvoiceId: "in_test", number: "PLAT-1001", invoiceDate: "2026-09-01", billingPeriodStart: "2026-09-01", billingPeriodEnd: "2026-09-30", currency: "USD", amountDueCents: 27_500, amountPaidCents: 27_500, status: "paid" },
      issuer: { legalName: "HFY LLC", productName: "Platform", email: "billing@example.test", address: "Los Angeles, CA" },
      billTo: { residencyName: "Hotel <Test>", contactName: "Billing", contactEmail: "hotel@example.test", address: "1 Test Way" },
      committedPlan: { revision: 2, cadence: "monthly", talentSessions: 8, housePrograms: 3, oneOffAllowance: 2, unitAmountCents: 2_500 },
    });
    const html = renderPlatformInvoiceHtml(snapshot);
    expect(html).toContain("Platform Subscription Invoice");
    expect(html).toContain("separate from HFY talent services");
    expect(html).toContain("Hotel &lt;Test&gt;");
    expect(html).not.toContain("Hotel <Test>");
    expect(snapshot.committedPlan.cadenceAmountCents).toBe(27_500);
  });
});

describe("payment failure access invariant", () => {
  it("shows the failure on every Residency page without changing authorization", async () => {
    const [layout, auth, alerts] = await Promise.all([
      readSource("../src/app/residency/layout.tsx"),
      readSource("../src/lib/auth.ts"),
      readSource("../src/services/platform-billing-alerts.ts"),
    ]);
    expect(layout).toContain("getResidencyPaymentFailure");
    expect(layout).toContain("platform-payment-failure-banner");
    expect(layout).toContain("Your portal remains fully available");
    expect(auth).not.toContain("paymentFailedAt");
    expect(alerts).toContain('accessBehavior: "never_restrict"');
    expect(alerts).toContain('requiredEnv("PLATFORM_BILLING_TEST_RECIPIENT_EMAIL")');
  });
});
