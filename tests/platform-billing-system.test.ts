import { readFile } from "node:fs/promises";
import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { comparePlatformUsage, calculatePlatformMonthlyAmountCents, platformCadenceChargeCents, platformCadenceInterval } from "@/domain/platform-billing";
import { LIVE_BILLING_HOLD_MESSAGE } from "@/domain/live-billing";
import { createPlatformInvoiceDocumentSnapshot } from "@/domain/platform-invoice-document";
import { assertPlatformBillingStaging, assertStripeTestConfiguration } from "@/domain/stripe-test-mode";
import { renderPlatformInvoiceHtml } from "@/services/invoice-pdf/platform-template";

const readSource = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

describe("Platform committed billing", () => {
  it("collects and stores split rates while retaining the blended columns only for compatibility", async () => {
    const [form, action, stripeService, invoiceService, schema, migration] = await Promise.all([
      readSource("../src/app/app/platform-billing/committed-plan-form.tsx"),
      readSource("../src/app/app/platform-billing/actions.ts"),
      readSource("../src/services/platform-stripe.ts"),
      readSource("../src/services/platform-invoices.ts"),
      readSource("../src/db/schema.ts"),
      readSource("../drizzle/0047_platform_subscription_revision_split_rates.sql"),
    ]);

    expect(form).toContain('name="talentSessionUnitAmount"');
    expect(form).toContain('name="houseProgramUnitAmount"');
    expect(form).not.toContain('name="unitAmount"');
    expect(action).toContain("talentSessionUnitAmountCents");
    expect(action).toContain("houseProgramUnitAmountCents");
    expect(stripeService).not.toContain("unitAmountCents: planInput.");
    expect(invoiceService).toContain("revisionTalentSessionUnitAmountCents");
    expect(invoiceService).toContain("revisionHouseProgramUnitAmountCents");
    expect(schema).toContain('talentSessionUnitAmountCents: integer("talent_session_unit_amount_cents").notNull()');
    expect(schema).toContain('houseProgramUnitAmountCents: integer("house_program_unit_amount_cents").notNull()');
    expect(migration).toContain('"talent_session_unit_amount_cents" = "unit_amount_cents"');
    expect(migration).toContain('"house_program_unit_amount_cents" = "unit_amount_cents"');
  });

  it("bills locked Talent and House quantities at their distinct committed rates", () => {
    const monthly = calculatePlatformMonthlyAmountCents({
      talentProgramSessions: 8,
      housePrograms: 3,
      oneOffAllowance: 99,
      talentSessionUnitAmountCents: 6_000,
      houseProgramUnitAmountCents: 5_000,
    } as Parameters<typeof calculatePlatformMonthlyAmountCents>[0] & { oneOffAllowance: number });
    expect(monthly).toBe(63_000);
    expect(platformCadenceChargeCents(monthly, "quarterly")).toBe(189_000);
    expect(platformCadenceChargeCents(monthly, "annual")).toBe(756_000);
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

describe("Founding Client tracking", () => {
  it("stores an explicit six-month window and exposes the owner-only enrollment and expired-tier indicator", async () => {
    const [schema, migration, form, action, page, stripeService] = await Promise.all([
      readSource("../src/db/schema.ts"),
      readSource("../drizzle/0048_founding_client_tracking.sql"),
      readSource("../src/app/app/platform-billing/committed-plan-form.tsx"),
      readSource("../src/app/app/platform-billing/actions.ts"),
      readSource("../src/app/app/platform-billing/page.tsx"),
      readSource("../src/services/platform-stripe.ts"),
    ]);

    expect(schema).toContain('foundingClientSignedAt: timestamp("founding_client_signed_at", { withTimezone: true })');
    expect(schema).toContain('foundingClientEndsAt: timestamp("founding_client_ends_at", { withTimezone: true })');
    expect(migration).toContain('"founding_client_signed_at" timestamp with time zone');
    expect(migration).toContain('"founding_client_ends_at" timestamp with time zone');
    expect(form).toContain("foundingClientActive");
    expect(form).toContain("no term selection");
    expect(action).toContain("requireInternalActorForMutation");
    expect(action).toContain("enrollFoundingClient");
    expect(page).toContain("Commitment-tier selection needed");
    expect(stripeService).toContain("enforceFoundingClientPlan");
    expect(stripeService).toContain("FOUNDING_CLIENT_UNIT_AMOUNT_CENTS");
  });
});

describe("Commitment ladder and clawback", () => {
  it("persists tier terms and queues a guarded clawback line on the next test invoice", async () => {
    const [schema, migration, form, action, stripeService, webhookService, page] = await Promise.all([
      readSource("../src/db/schema.ts"),
      readSource("../drizzle/0049_commitment_ladder_clawback.sql"),
      readSource("../src/app/app/platform-billing/committed-plan-form.tsx"),
      readSource("../src/app/app/platform-billing/actions.ts"),
      readSource("../src/services/platform-stripe.ts"),
      readSource("../src/services/platform-stripe-webhooks.ts"),
      readSource("../src/app/app/platform-billing/page.tsx"),
    ]);

    expect(schema).toContain('platformCommitmentTier("commitment_tier")');
    expect(schema).toContain('platformSubscriptionClawbacks = pgTable("platform_subscription_clawbacks"');
    expect(migration).toContain('CREATE TYPE "public"."platform_commitment_tier"');
    expect(migration).toContain('CREATE TABLE "platform_subscription_clawbacks"');
    expect(form).toContain('name="commitmentTier"');
    expect(form).toContain("House stays $60 at every tier");
    expect(action).toContain("commitmentTier: parsed.commitmentTier ?? null");
    expect(stripeService).toContain("calculateCommitmentClawback");
    expect(stripeService).toContain("queueCommitmentCancellationClawback");
    expect(webhookService).toContain('event.type === "invoice.created"');
    expect(webhookService).toContain('action: "stripe_invoice_item_create"');
    expect(webhookService).toContain("stripe.invoiceItems.create");
    expect(page).toContain("pastForgivenessWindow");
  });

  it("renders a clawback as its own invoice line", () => {
    const snapshot = createPlatformInvoiceDocumentSnapshot({
      invoice: { id: "invoice", stripeInvoiceId: "in_test", number: "PLAT-1002", invoiceDate: "2027-04-01", billingPeriodStart: "2027-04-01", billingPeriodEnd: "2027-04-30", currency: "USD", amountDueCents: 82_000, amountPaidCents: 0, status: "open" },
      issuer: { legalName: "HFY LLC", productName: "Platform", email: "billing@example.test", address: "" },
      billTo: { residencyName: "Hotel", contactName: "Billing", contactEmail: "hotel@example.test", address: "" },
      committedPlan: { revision: 3, cadence: "monthly", talentSessions: 8, talentSessionUnitAmountCents: 6_000, housePrograms: 0, houseProgramUnitAmountCents: 6_000, oneOffAllowance: 0 },
      adjustments: [{
        description: "Early termination clawback — 6-month commitment",
        quantity: 17,
        unitAmountCents: 2_000,
        amountCents: 34_000,
        detail: "Recovery of the commitment discount on Talent sessions already billed",
      }],
    });
    expect(snapshot.lines.at(-1)).toMatchObject({
      description: "Early termination clawback — 6-month commitment",
      quantity: 17,
      unitAmountCents: 2_000,
      amountCents: 34_000,
    });
    expect(renderPlatformInvoiceHtml(snapshot)).toContain("Recovery of the commitment discount");
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
    const [webhookRoute, webhookService, stripeService, nextConfig] = await Promise.all([
      readSource("../src/app/api/stripe/webhook/route.ts"),
      readSource("../src/services/platform-stripe-webhooks.ts"),
      readSource("../src/services/platform-stripe.ts"),
      readSource("../next.config.ts"),
    ]);
    expect(webhookRoute).toContain("request.text()");
    expect(webhookRoute).toContain("webhooks.constructEvent");
    expect(webhookRoute).toContain("event.livemode");
    expect(webhookService).toContain("onConflictDoNothing()");
    expect(webhookService).toContain('await import("@/services/platform-invoices")');
    expect(nextConfig).toContain('"/api/stripe/webhook"');
    expect(nextConfig).toContain('"./node_modules/playwright-core/browsers.json"');
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

describe("per-Residency live-billing safety", () => {
  it("guards all Platform email and Stripe mutation entry points without replacing the environment gate", async () => {
    const [schema, migration, emailService, alerts, stripeService, webhookService, ownerAction, residencyAction, eslintConfig] = await Promise.all([
      readSource("../src/db/schema.ts"),
      readSource("../drizzle/0046_live_billing_safety_switch.sql"),
      readSource("../src/services/platform-billing-email.ts"),
      readSource("../src/services/platform-billing-alerts.ts"),
      readSource("../src/services/platform-stripe.ts"),
      readSource("../src/services/platform-stripe-webhooks.ts"),
      readSource("../src/app/app/actions.ts"),
      readSource("../src/app/residency/settings/billing/actions.ts"),
      readSource("../eslint.config.mjs"),
    ]);
    expect(schema).toContain('liveBillingApproved: boolean("live_billing_approved").notNull().default(false)');
    expect(migration).toContain('"live_billing_approved" boolean DEFAULT false NOT NULL');
    expect(emailService).toContain("routeOutboundEmailForLiveBillingApproval");
    expect(emailService).toContain("logLiveBillingBlock");
    expect(alerts).toContain("sendPlatformBillingEmail");
    expect(stripeService).toContain("requireResidencyLiveBillingApproval");
    expect(stripeService).toContain("assertCurrentPlatformBillingStaging");
    expect(webhookService).toContain("requireResidencyLiveBillingApproval");
    expect(ownerAction).toContain("requireInternalActor");
    expect(ownerAction).toContain("liveBillingApprovalPhrase");
    expect(residencyAction).toContain("liveBilling=blocked");
    expect(eslintConfig).toContain("per-Residency platform-billing-email safety service");
    expect(LIVE_BILLING_HOLD_MESSAGE).toBe("Live billing is not yet approved for this Residency.");
  });
});

describe("Platform Invoice document", () => {
  it("uses a distinct subscription template and escapes client content", () => {
    const snapshot = createPlatformInvoiceDocumentSnapshot({
      invoice: { id: "invoice", stripeInvoiceId: "in_test", number: "PLAT-1001", invoiceDate: "2026-09-01", billingPeriodStart: "2026-09-01", billingPeriodEnd: "2026-09-30", currency: "USD", amountDueCents: 63_000, amountPaidCents: 63_000, status: "paid" },
      issuer: { legalName: "HFY LLC", productName: "Platform", email: "billing@example.test", address: "69365 El Canto Rd\nCathedral City, CA 92234" },
      billTo: { residencyName: "Hotel <Test>", contactName: "Billing", contactEmail: "hotel@example.test", address: "1 Test Way" },
      committedPlan: { revision: 2, cadence: "monthly", talentSessions: 8, talentSessionUnitAmountCents: 6_000, housePrograms: 3, houseProgramUnitAmountCents: 5_000, oneOffAllowance: 2 },
    });
    const html = renderPlatformInvoiceHtml(snapshot);
    expect(html).toContain("Platform Subscription Invoice");
    expect(html).toContain("separate from HFY talent services");
    expect(html).toContain("69365 El Canto Rd");
    expect(html).toContain("Cathedral City, CA 92234");
    expect(html).toContain("Hotel &lt;Test&gt;");
    expect(html).not.toContain("Hotel <Test>");
    expect(snapshot.committedPlan.cadenceAmountCents).toBe(63_000);
    expect(snapshot.lines).toEqual([
      { description: "Committed Talent sessions", quantity: 8, unitAmountCents: 6_000, amountCents: 48_000 },
      { description: "Committed House programs", quantity: 3, unitAmountCents: 5_000, amountCents: 15_000 },
    ]);
    expect(html).toContain("$60.00");
    expect(html).toContain("$50.00");
  });
});

describe("payment failure access invariant", () => {
  it("shows the failure on every Residency page without changing authorization", async () => {
    const [layout, auth, alerts, accountSetup, invoiceDelivery, outboundEmail, eslintConfig] = await Promise.all([
      readSource("../src/app/residency/layout.tsx"),
      readSource("../src/lib/auth.ts"),
      readSource("../src/services/platform-billing-alerts.ts"),
      readSource("../src/services/account-setup-email.ts"),
      readSource("../src/services/invoice-delivery.ts"),
      readSource("../src/services/outbound-email.ts"),
      readSource("../eslint.config.mjs"),
    ]);
    expect(layout).toContain("getResidencyPaymentFailure");
    expect(layout).toContain("platform-payment-failure-banner");
    expect(layout).toContain("Your portal remains fully available");
    expect(auth).not.toContain("paymentFailedAt");
    expect(alerts).toContain('accessBehavior: "never_restrict"');
    expect(alerts).toContain("sendPlatformBillingEmail");
    expect([accountSetup, invoiceDelivery].every((source) => source.includes("sendEmail"))).toBe(true);
    expect([alerts, accountSetup, invoiceDelivery].every((source) => !source.includes('from "resend"'))).toBe(true);
    expect(outboundEmail).toContain("routeOutboundEmailForEnvironment");
    expect(eslintConfig).toContain('name: "resend"');
    expect(eslintConfig).toContain('ignores: ["src/services/outbound-email.ts"]');
  });
});
