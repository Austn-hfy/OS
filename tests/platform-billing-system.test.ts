import { readFile } from "node:fs/promises";
import Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { comparePlatformUsage, calculatePlatformPlanAmounts, platformTermInterval } from "@/domain/platform-billing";
import { LIVE_BILLING_HOLD_MESSAGE } from "@/domain/live-billing";
import { createPlatformInvoiceDocumentSnapshot } from "@/domain/platform-invoice-document";
import { assertPlatformBillingStaging, assertStripeTestConfiguration, isResidencyLiveStripeMode, isStripeLiveConfiguration } from "@/domain/stripe-test-mode";
import { isCurrentPlatformBillingAvailable } from "@/lib/platform-billing-stage";
import { renderPlatformInvoiceHtml } from "@/services/invoice-pdf/platform-template";

const readSource = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

afterEach(() => vi.unstubAllEnvs());

describe("Platform committed billing", () => {
  it("stores buckets, fixed rate, and two terms throughout the stack", async () => {
    const [form, action, stripeService, invoiceService, schema, migration] = await Promise.all([
      readSource("../src/app/app/platform-billing/committed-plan-form.tsx"),
      readSource("../src/app/app/platform-billing/actions.ts"),
      readSource("../src/services/platform-stripe.ts"),
      readSource("../src/services/platform-invoices.ts"),
      readSource("../src/db/schema.ts"),
      readSource("../drizzle/0051_platform_billing_buckets_v14.sql"),
    ]);

    expect(form).toContain('name="talentBucketSize"');
    expect(form).toContain('name="houseBucketSize"');
    expect(form).toContain('name="term"');
    expect(action).toContain("talentBucketSize: parsed.talentBucketSize");
    expect(stripeService).toContain("slot_unit_amount_cents");
    expect(invoiceService).toContain("revisionTalentBucketSize");
    expect(schema).toContain('talentBucketSize: integer("talent_bucket_size").notNull()');
    expect(schema).toContain('houseBucketSize: integer("house_bucket_size").notNull()');
    expect(schema).toContain('slotUnitAmountCents: integer("slot_unit_amount_cents").notNull().default(3_000)');
    expect(migration).toContain("HFYOS v14 migration aborted: legacy Talent count");
    expect(migration).toContain('DROP COLUMN "talent_session_unit_amount_cents"');
  });

  it("keeps Account and Billing on the same Settings desktop geometry", async () => {
    const [accountPage, billingPage, designSystem, styles] = await Promise.all([
      readSource("../src/app/residency/settings/page.tsx"),
      readSource("../src/app/residency/settings/billing/page.tsx"),
      readSource("../src/components/residency-design-system.tsx"),
      readSource("../src/app/hfy-style-pilot.css"),
    ]);

    for (const page of [accountPage, billingPage]) {
      expect(page).toContain("workspace-surface-client-settings");
      expect(page).toContain("settings-page-body");
      expect(page).toContain("<ResidencyTabs");
    }
    expect(designSystem).toContain('aria-current={item.href === activeHref ? "page" : undefined}');
    expect(accountPage).toContain('eyebrow="Settings · Account" title="Account settings"');
    expect(styles).toContain(".workspace-surface-client-settings > .residency-tabs");
    expect(styles).toContain(".residency-page-body");
    expect(styles).toContain(".platform-annual-confirmation-actions");
  });

  it("bills the buckets at $30 and discounts an upfront annual term by 25%", () => {
    expect(calculatePlatformPlanAmounts({ talentBucketSize: 20, houseBucketSize: 10, term: "month_to_month" }).termChargeAmountCents).toBe(90_000);
    expect(calculatePlatformPlanAmounts({ talentBucketSize: 20, houseBucketSize: 10, term: "annual" }).termChargeAmountCents).toBe(810_000);
    expect(platformTermInterval("annual")).toEqual({ interval: "year", intervalCount: 1 });
  });

  it("compares Live Usage without mutating plan quantities or producing money", () => {
    const plan = { talentBucketSize: 10, houseBucketSize: 5 };
    const comparison = comparePlatformUsage(plan, { talentSessions: 12, housePrograms: 2 });
    expect(plan).toEqual({ talentBucketSize: 10, houseBucketSize: 5 });
    expect(comparison).toMatchObject({ withinPlan: false, totalOverBy: 2 });
    expect(comparison.talentSessions.overBy).toBe(2);
    expect(comparison.housePrograms.withinPlan).toBe(true);
  });

  it("presents capacities and a Residency-scoped annual switch without client revision copy", async () => {
    const [clientPage, clientAction, annualConfirmation, ownerPage, ownerForm] = await Promise.all([
      readSource("../src/app/residency/settings/billing/page.tsx"),
      readSource("../src/app/residency/settings/billing/actions.ts"),
      readSource("../src/app/residency/settings/billing/annual-switch-confirmation.tsx"),
      readSource("../src/app/app/platform-billing/page.tsx"),
      readSource("../src/app/app/platform-billing/committed-plan-form.tsx"),
    ]);

    expect(clientPage).toContain("annualSavingsAmountCents");
    expect(clientPage).toContain("switchResidencyPlatformPlanToAnnualAction");
    expect(clientAction).toContain("previewResidencyAnnualSwitch(actor)");
    expect(clientAction).toContain("beginResidencyAnnualSwitch(actor, prorationDate)");
    expect(clientAction).toContain('formData.get("confirmation") !== "switch_to_annual"');
    expect(annualConfirmation).toContain("Current plan");
    expect(annualConfirmation).toContain("New plan");
    expect(annualConfirmation).toContain("annualUpfrontAmountCents");
    expect(annualConfirmation).toContain("annualSavingsAmountCents");
    expect(annualConfirmation).toContain('className="platform-annual-timeline"');
    expect(annualConfirmation).toContain('aria-label="What happens after confirming"');
    expect(annualConfirmation).toContain("Review savings");
    expect(annualConfirmation).toContain("Annual billing starts today");
    expect(annualConfirmation).toContain("Actual Stripe charge today");
    expect(annualConfirmation).toContain('<button className="button secondary" type="button" ref={cancelRef}');
    expect(annualConfirmation).toContain("Keep month-to-month");
    expect(annualConfirmation).toContain("card in Stripe Checkout");
    expect(clientPage).toContain('className="platform-plan-and-usage"');
    expect(clientPage).not.toContain("Plan &amp; usage");
    expect(clientPage).toContain('title="Subscription details"');
    expect(clientPage).toContain('className="platform-plan-facts"');
    expect(clientPage).toContain('className="platform-client-usage-list"');
    expect(clientPage).toContain('className="platform-annual-switch offer"');
    expect(clientPage).not.toContain("Annual billing scheduled");
    expect(clientPage).toContain('className="platform-plan-term-badge active"');
    expect(clientPage).toContain("Annual · 25% off");
    expect(clientPage).toContain("Talent capacity");
    expect(clientPage).toContain("House capacity");
    expect(clientPage).not.toContain("Current plan · revision");
    expect(ownerPage).toContain("Committed Plan · revision");
    expect(ownerForm).toContain("Talent capacity");
    expect(ownerForm).toContain("House capacity");
  });

  it("activates annual only after Stripe confirms the immediate prorated Price and invoice", async () => {
    const [clientPage, stripeService, webhookService] = await Promise.all([
      readSource("../src/app/residency/settings/billing/page.tsx"),
      readSource("../src/services/platform-stripe.ts"),
      readSource("../src/services/platform-stripe-webhooks.ts"),
    ]);

    expect(stripeService).not.toContain('billing_cycle_anchor: "now"');
    expect(stripeService.match(/proration_date: prorationDate/g)).toHaveLength(2);
    expect(stripeService).toContain('proration_behavior: "always_invoice"');
    expect(stripeService).toContain('payment_behavior: "error_if_incomplete"');
    expect(stripeService).toContain("updatedItem?.price.id !== price.id || updatedSubscription.pending_update");
    expect(clientPage).not.toContain("pendingAnnualChange");
    expect(clientPage).toContain("Stripe is completing the immediate prorated annual charge now.");
    expect(webhookService).toContain("eq(platformSubscriptionRevisions.stripePriceId, item.price.id)");
    expect(webhookService).toContain("switchResidencyCommittedPlanToAnnualImmediately");
    expect(webhookService).toContain("annual_switch_proration_date");
  });

  it("retires Ace's reviewed deferred schedule state without broadening the cleanup target", async () => {
    const [migration, stripeService] = await Promise.all([
      readSource("../drizzle/0054_retire_ace_deferred_annual_revision.sql"),
      readSource("../src/services/platform-stripe.ts"),
    ]);

    expect(migration).toContain("27c559a6-f548-46c4-a145-d08d89f75da5");
    expect(migration).toContain('AND "revision" = 4');
    expect(migration).toContain('AND "stripe_sync_status" = \'pending\'');
    expect(migration).toContain("platform_deferred_annual_revision_retired");
    expect(stripeService).toContain("subscriptionSchedules.release(scheduleId)");
    expect(stripeService).toContain("stripePriceHasActiveReferences");
    expect(stripeService).toContain("subscriptionSchedules.list({ limit: 100 })");
    expect(stripeService).toContain("prices.update(priceId, { active: false })");
  });
});

describe("retired pricing structures", () => {
  it("removes Founding Client, commitment tiers, raw rates, and one-off billing", async () => {
    const [schema, migration, form, action, page, stripeService] = await Promise.all([
      readSource("../src/db/schema.ts"),
      readSource("../drizzle/0051_platform_billing_buckets_v14.sql"),
      readSource("../src/app/app/platform-billing/committed-plan-form.tsx"),
      readSource("../src/app/app/platform-billing/actions.ts"),
      readSource("../src/app/app/platform-billing/page.tsx"),
      readSource("../src/services/platform-stripe.ts"),
    ]);

    for (const source of [schema, form, action, page, stripeService]) {
      expect(source).not.toMatch(/foundingClient|commitmentTier|oneOffAllowance|talentSessionUnitAmountCents|houseProgramUnitAmountCents/);
    }
    expect(migration).toContain('DROP COLUMN "founding_client_signed_at"');
    expect(migration).toContain('DROP TYPE "public"."platform_commitment_tier"');
    expect(migration).toContain('DROP TABLE "platform_subscription_clawbacks"');
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
    expect(setup).toContain("<CompedResidencyControl");
    expect(control).toContain("compedResidencyConfirmationPhrase");
    expect(ownerAction).toContain("requireInternalActorForMutation");
    expect(ownerAction).toContain("updateResidencyCompedStatus");
    expect(ownerPage).toContain("Permanently comped · $0 billed");
    expect(ownerPage).toContain("COMPED · $0");
    expect(planForm).toContain("$0 billed");
    expect(stripeService).toContain("effectiveComped");
  });

  it("renders $0 invoice line items from an unchanged nonzero underlying plan", () => {
    const storedPlan = { revision: 7, term: "annual" as const, talentBucketSize: 20, houseBucketSize: 10, slotUnitAmountCents: 3_000 };
    const snapshot = createPlatformInvoiceDocumentSnapshot({
      comped: true,
      invoice: { id: "invoice", stripeInvoiceId: "in_test", number: "PLAT-COMP", invoiceDate: "2027-09-01", billingPeriodStart: "2027-09-01", billingPeriodEnd: "2027-09-30", currency: "USD", amountDueCents: 0, amountPaidCents: 0, status: "paid" },
      issuer: { legalName: "HFY LLC", productName: "Platform", email: "billing@example.test", address: "" },
      billTo: { residencyName: "Internal Test", contactName: "Billing", contactEmail: "test@example.test", address: "" },
      committedPlan: storedPlan,
    });

    expect(snapshot.committedPlan).toMatchObject({
      slotUnitAmountCents: 0,
      baseMonthlyAmountCents: 0,
      termChargeAmountCents: 0,
    });
    expect(snapshot.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ description: "Talent bucket", unitAmountCents: 0, amountCents: 0 }),
      expect.objectContaining({ description: "House bucket", unitAmountCents: 0, amountCents: 0 }),
    ]));
    expect(storedPlan).toMatchObject({ talentBucketSize: 20, houseBucketSize: 10, slotUnitAmountCents: 3_000 });
  });
});

describe("annual cancellation refund", () => {
  it("persists the Section 5.7 formula and queues it only when an annual subscription cancels", async () => {
    const [schema, migration, stripeService, webhookService] = await Promise.all([
      readSource("../src/db/schema.ts"),
      readSource("../drizzle/0051_platform_billing_buckets_v14.sql"),
      readSource("../src/services/platform-stripe.ts"),
      readSource("../src/services/platform-stripe-webhooks.ts"),
    ]);

    expect(schema).toContain('platformSubscriptionRefunds = pgTable("platform_subscription_refunds"');
    expect(migration).toContain('CREATE TABLE "platform_subscription_refunds"');
    expect(migration).toContain('"refund_amount_cents" = GREATEST(0, "total_annual_payment_cents" - ("months_used" * "full_monthly_amount_cents"))');
    expect(stripeService).toContain("calculateAnnualCancellationRefund");
    expect(stripeService).toContain('if (plan.term !== "annual") return null');
    expect(webhookService).toContain("queueAnnualCancellationRefund(plan, now)");
  });
});

describe("Stripe environment safety", () => {
  const safe = {
    STRIPE_SECRET_KEY: "sk_test_example",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_example",
    NEXT_PUBLIC_APP_URL: "https://staging.hfy.app",
    VERCEL: "1",
    VERCEL_ENV: "preview",
  };

  it("accepts test keys in stable staging and production", () => {
    expect(assertStripeTestConfiguration(safe)).toEqual({ secretKey: "sk_test_example", publishableKey: "pk_test_example" });
    expect(assertStripeTestConfiguration({
      ...safe,
      NEXT_PUBLIC_APP_URL: "https://hfy.app",
      VERCEL_ENV: "production",
      VERCEL_TARGET_ENV: "production",
    })).toEqual({ secretKey: "sk_test_example", publishableKey: "pk_test_example" });
  });

  it("identifies live display mode only when both configured Stripe keys are live", () => {
    expect(isStripeLiveConfiguration({
      STRIPE_SECRET_KEY: "sk_live_example",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_example",
    })).toBe(true);
    expect(isStripeLiveConfiguration({
      STRIPE_SECRET_KEY: "sk_test_example",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_example",
    })).toBe(false);
    expect(isStripeLiveConfiguration({
      STRIPE_SECRET_KEY: "sk_live_example",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_example",
    })).toBe(false);
    expect(isResidencyLiveStripeMode(false, {
      STRIPE_SECRET_KEY: "sk_live_example",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_example",
    })).toBe(false);
    expect(isResidencyLiveStripeMode(true, {
      STRIPE_SECRET_KEY: "sk_live_example",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_example",
    })).toBe(true);
  });

  it("rejects non-test keys and unsupported Vercel execution environments before Stripe can be called", () => {
    expect(() => assertStripeTestConfiguration({ ...safe, STRIPE_SECRET_KEY: "sk_example" })).toThrow(/TEST MODE/);
    expect(() => assertStripeTestConfiguration({ ...safe, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_example" })).toThrow(/TEST MODE/);
    expect(() => assertStripeTestConfiguration({ ...safe, STRIPE_SECRET_KEY: undefined })).toThrow(/sk_test_/);
    expect(() => assertStripeTestConfiguration({ ...safe, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: undefined })).toThrow(/pk_test_/);
    expect(() => assertStripeTestConfiguration({ ...safe, VERCEL_ENV: "development", NEXT_PUBLIC_APP_URL: "https://hfy.app" })).toThrow(/staging deployment/);
    expect(() => assertPlatformBillingStaging({ VERCEL: "1", VERCEL_ENV: "development", NEXT_PUBLIC_APP_URL: "https://development.example.test" })).toThrow(/production or the stable staging deployment/);
  });

  it("reports the current production deployment as available", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_TARGET_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://hfy.app");

    expect(isCurrentPlatformBillingAvailable()).toBe(true);
    expect(() => assertPlatformBillingStaging({ VERCEL: "1", VERCEL_ENV: "production" })).not.toThrow();
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

describe("billing surface availability", () => {
  it("keeps one shared availability gate on billing surfaces without gating the Residency Overview", async () => {
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
    expect(residencyShell).toContain('{canManage ? <WorkspaceNavLink href="/residency"');
    expect(residencyShell).not.toContain('canManage && platformBillingAvailable ? <WorkspaceNavLink href="/residency"');
    expect(residencyOverview).toContain("getResidencyClientOverview(actor.residencyId)");
    expect(residencyOverview).not.toContain("isCurrentPlatformBillingAvailable");
    expect(residencyOverview).not.toContain("getResidencyPlatformBilling");
    expect(settingsPage).toContain('...(platformBillingAvailable ? [{ href: "/residency/settings/billing", label: "Billing" }] : [])');
    expect(residencyBillingPage.indexOf("isCurrentPlatformBillingAvailable()")).toBeLessThan(residencyBillingPage.indexOf("getResidencyPlatformBilling(actor.residencyId)"));
    expect(residencyBillingPage).toContain("notFound()");
    expect(setupPage).toContain("platformBillingAvailable ? <LiveBillingSafetyControl");
    expect(ownerPdf).toContain("if (!isCurrentPlatformBillingAvailable()) notFound()");
    expect(residencyPdf).toContain("if (!isCurrentPlatformBillingAvailable()) notFound()");
  });
});

describe("Platform Invoice document", () => {
  it("uses a v4 bucket snapshot, explicit annual discount, and escapes client content", () => {
    const snapshot = createPlatformInvoiceDocumentSnapshot({
      invoice: { id: "invoice", stripeInvoiceId: "in_test", number: "PLAT-1001", invoiceDate: "2026-09-01", billingPeriodStart: "2026-09-01", billingPeriodEnd: "2027-08-31", currency: "USD", amountDueCents: 810_000, amountPaidCents: 810_000, status: "paid" },
      issuer: { legalName: "HFY LLC", productName: "Platform", email: "billing@example.test", address: "69365 El Canto Rd\nCathedral City, CA 92234" },
      billTo: { residencyName: "Hotel <Test>", contactName: "Billing", contactEmail: "hotel@example.test", address: "1 Test Way" },
      committedPlan: { revision: 2, term: "annual", talentBucketSize: 20, houseBucketSize: 10, slotUnitAmountCents: 3_000 },
    });
    const html = renderPlatformInvoiceHtml(snapshot);
    expect(html).toContain("Platform Subscription Invoice");
    expect(html).toContain("separate from HFY talent services");
    expect(html).toContain("69365 El Canto Rd");
    expect(html).toContain("Cathedral City, CA 92234");
    expect(html).toContain("Hotel &lt;Test&gt;");
    expect(html).not.toContain("Hotel <Test>");
    expect(snapshot.schemaVersion).toBe(4);
    expect(snapshot.committedPlan.termChargeAmountCents).toBe(810_000);
    expect(snapshot.lines).toEqual([
      { description: "Talent bucket", quantity: 240, unitAmountCents: 3_000, amountCents: 720_000 },
      { description: "House bucket", quantity: 120, unitAmountCents: 3_000, amountCents: 360_000 },
      { description: "Annual prepayment discount (25%)", quantity: 1, unitAmountCents: -270_000, amountCents: -270_000, detail: "25% off the full month-to-month total for paying annually upfront" },
    ]);
    expect(html).toContain("Annual prepayment discount (25%)");
    expect(html).toContain("$30.00");
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
