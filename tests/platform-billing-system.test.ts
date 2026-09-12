import { readFile } from "node:fs/promises";
import Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { comparePlatformUsage, calculatePlatformMonthlyAmountCents, platformCadenceChargeCents, platformCadenceInterval } from "@/domain/platform-billing";
import { LIVE_BILLING_HOLD_MESSAGE } from "@/domain/live-billing";
import { createPlatformInvoiceDocumentSnapshot } from "@/domain/platform-invoice-document";
import { assertPlatformBillingStaging, assertStripeTestConfiguration } from "@/domain/stripe-test-mode";
import { isCurrentPlatformBillingAvailable } from "@/lib/platform-billing-stage";
import { renderPlatformInvoiceHtml } from "@/services/invoice-pdf/platform-template";

const readSource = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

afterEach(() => vi.unstubAllEnvs());

describe("Platform billing migration sequence", () => {
  it("runs after the existing shift-request migrations without timestamp gaps that Drizzle could skip", async () => {
    const journal = JSON.parse(await readSource("../drizzle/meta/_journal.json")) as {
      entries: Array<{ idx: number; when: number; tag: string }>;
    };
    const promotedSequence = journal.entries.slice(-9);

    expect(promotedSequence.map(({ idx, tag }) => ({ idx, tag }))).toEqual([
      { idx: 42, tag: "0042_shift_change_requests" },
      { idx: 43, tag: "0043_shift_change_request_pending_unique" },
      { idx: 44, tag: "0044_preserve_resolved_shift_requests" },
      { idx: 45, tag: "0045_platform_billing_system" },
      { idx: 46, tag: "0046_live_billing_safety_switch" },
      { idx: 47, tag: "0047_platform_subscription_revision_split_rates" },
      { idx: 48, tag: "0048_founding_client_tracking" },
      { idx: 49, tag: "0049_commitment_ladder_clawback" },
      { idx: 50, tag: "0050_comped_residencies" },
    ]);
    expect(promotedSequence.every((entry, index) => index === 0 || entry.when > promotedSequence[index - 1].when)).toBe(true);
  });
});

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

describe("permanently comped Residencies", () => {
  it("persists an owner-only flag, requires confirmation, and presents unmistakable $0 status", async () => {
    const [schema, migration, setup, control, ownerAction, ownerPage, planForm, stripeService] = await Promise.all([
      readSource("../src/db/schema.ts"),
      readSource("../drizzle/0050_comped_residencies.sql"),
      readSource("../src/app/app/setup/page.tsx"),
      readSource("../src/app/app/setup/comped-residency-control.tsx"),
      readSource("../src/app/app/actions.ts"),
      readSource("../src/app/app/platform-billing/page.tsx"),
      readSource("../src/app/app/platform-billing/committed-plan-form.tsx"),
      readSource("../src/services/platform-stripe.ts"),
    ]);

    expect(schema).toContain('comped: boolean("comped").notNull().default(false)');
    expect(migration).toContain('"comped" boolean DEFAULT false NOT NULL');
    expect(migration).toContain("residencies_comped_not_founding");
    expect(setup).toContain("<CompedResidencyControl");
    expect(control).toContain("compedResidencyConfirmationPhrase");
    expect(ownerAction).toContain("requireInternalActorForMutation");
    expect(ownerAction).toContain("updateResidencyCompedStatus");
    expect(ownerPage).toContain("Permanently comped · $0 Platform rates");
    expect(ownerPage).toContain("COMPED · $0");
    expect(planForm).toContain("$0 Talent · $0 House");
    expect(stripeService).toContain("effectiveCompedPlan");
    expect(stripeService).not.toContain("enforceCompedPlan(input");
  });

  it("renders $0 invoice line items from an unchanged nonzero underlying plan", () => {
    const storedPlan = { revision: 7, cadence: "monthly" as const, talentSessions: 8, talentSessionUnitAmountCents: 7_000, housePrograms: 3, houseProgramUnitAmountCents: 6_000, oneOffAllowance: 2 };
    const snapshot = createPlatformInvoiceDocumentSnapshot({
      comped: true,
      invoice: { id: "invoice", stripeInvoiceId: "in_test", number: "PLAT-COMP", invoiceDate: "2027-09-01", billingPeriodStart: "2027-09-01", billingPeriodEnd: "2027-09-30", currency: "USD", amountDueCents: 0, amountPaidCents: 0, status: "paid" },
      issuer: { legalName: "HFY LLC", productName: "Platform", email: "billing@example.test", address: "" },
      billTo: { residencyName: "Internal Test", contactName: "Billing", contactEmail: "test@example.test", address: "" },
      committedPlan: storedPlan,
    });

    expect(snapshot.committedPlan).toMatchObject({
      talentSessionUnitAmountCents: 0,
      houseProgramUnitAmountCents: 0,
      monthlyAmountCents: 0,
      cadenceAmountCents: 0,
    });
    expect(snapshot.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ description: "Committed Talent sessions", unitAmountCents: 0, amountCents: 0 }),
      expect.objectContaining({ description: "Committed House programs", unitAmountCents: 0, amountCents: 0 }),
    ]));
    expect(storedPlan).toMatchObject({ talentSessionUnitAmountCents: 7_000, houseProgramUnitAmountCents: 6_000 });
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

  it("reports the current production deployment as unavailable without changing the throwing lock", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_TARGET_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://hfy.app");

    expect(isCurrentPlatformBillingAvailable()).toBe(false);
    expect(() => assertPlatformBillingStaging({ VERCEL: "1", VERCEL_ENV: "production" })).toThrow("Platform billing is staging-only and is disabled in the production deployment.");
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
    expect(residencyAction).toContain('status: "error"');
    expect(eslintConfig).toContain("per-Residency platform-billing-email safety service");
    expect(LIVE_BILLING_HOLD_MESSAGE).toBe("Live billing is not yet approved for this Residency.");
  });
});

describe("production billing visibility hold", () => {
  it("removes billing navigation and gates every billing surface before data loads", async () => {
    const [appLayout, internalShell, ownerPage, residencyLayout, residencyShell, residencyOverview, settingsPage, residencyBillingPage, setupPage, ownerPdf, residencyPdf] = await Promise.all([
      readSource("../src/app/app/layout.tsx"),
      readSource("../src/components/internal-shell.tsx"),
      readSource("../src/app/app/platform-billing/page.tsx"),
      readSource("../src/app/residency/layout.tsx"),
      readSource("../src/components/residency-shell.tsx"),
      readSource("../src/app/residency/page.tsx"),
      readSource("../src/app/residency/settings/page.tsx"),
      readSource("../src/app/residency/settings/billing/page.tsx"),
      readSource("../src/app/app/setup/page.tsx"),
      readSource("../src/app/app/platform-billing/invoices/[invoiceId]/pdf/route.ts"),
      readSource("../src/app/residency/settings/billing/invoices/[invoiceId]/pdf/route.ts"),
    ]);

    expect(appLayout).toContain("platformBillingAvailable={platformBillingAvailable}");
    expect(internalShell).toContain('...(platformBillingAvailable ? [{ label: "Platform Billing"');
    expect(ownerPage.indexOf("isCurrentPlatformBillingAvailable()")).toBeLessThan(ownerPage.indexOf("getPlatformRevenueDashboard()"));
    expect(ownerPage).toContain("notFound()");
    expect(residencyLayout).toContain("platformBillingAvailable ? await getResidencyPaymentFailure");
    expect(residencyShell).toContain("canManage && platformBillingAvailable");
    expect(residencyOverview.indexOf("isCurrentPlatformBillingAvailable()")).toBeLessThan(residencyOverview.indexOf("getResidencyPlatformBilling(actor.residencyId)"));
    expect(settingsPage).toContain('platformBillingAvailable ? <Link href="/residency/settings/billing">Billing</Link> : null');
    expect(residencyBillingPage.indexOf("isCurrentPlatformBillingAvailable()")).toBeLessThan(residencyBillingPage.indexOf("getResidencyPlatformBilling(actor.residencyId)"));
    expect(residencyBillingPage).toContain("notFound()");
    expect(setupPage).toContain("platformBillingAvailable ? <LiveBillingSafetyControl");
    expect(ownerPdf).toContain("if (!isCurrentPlatformBillingAvailable()) notFound()");
    expect(residencyPdf).toContain("if (!isCurrentPlatformBillingAvailable()) notFound()");
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
    expect(layout).toContain("platformBillingAvailable ? await getResidencyPaymentFailure");
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
