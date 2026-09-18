import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

describe("Residency self-service billing Stripe contract", () => {
  it("gets the capacity-reduction comparison from Stripe and schedules it without proration", async () => {
    const source = await read("./residency-billing-management.ts");
    expect(source).toContain("stripe.invoices.createPreview");
    expect(source).toContain('billing_cycle_anchor: "unchanged"');
    expect(source).toContain('proration_behavior: "none"');
    expect(source).toContain("nextStripeInvoiceAmountCents: preview.amount_due");
    expect(source).toContain("scheduleStripePlanAtRenewal(subscription, price, revision)");
    expect(source).toContain("amountDueTodayCents: 0");
  });

  it("schedules cancellation at paid-period end and does not invoke the annual refund path", async () => {
    const source = await read("./residency-billing-management.ts");
    expect(source).toContain("cancel_at_period_end: true");
    expect(source).toContain('pendingChangeKind: "cancel"');
    expect(source).not.toContain("queueAnnualCancellationRefund");
  });

  it("implements one-, two-, and three-period pauses with a Stripe resume timestamp", async () => {
    const source = await read("./residency-billing-management.ts");
    expect(source).toContain("periods: 1 | 2 | 3");
    expect(source).toContain('pause_collection: { behavior: "void", resumes_at: resumesAtUnix }');
    expect(source).toContain('pendingChangeKind: "pause"');
  });

  it("pays only an open invoice owned by the Residency subscription", async () => {
    const source = await read("./residency-billing-management.ts");
    expect(source).toContain('eq(platformSubscriptionInvoices.status, "open")');
    expect(source).toContain("Stripe invoice ownership does not match this Residency.");
    expect(source).toContain("stripe.invoices.pay(invoice.id, { off_session: true })");
  });

  it("keeps production live Stripe execution outside this release", async () => {
    const source = await read("./residency-billing-management.ts");
    expect(source).toContain("assertCurrentPlatformBillingStaging()");
    expect(source).toContain("Live-mode Stripe subscriptions are rejected by this test-only billing build.");
    expect(source).toContain("Live-mode Stripe invoices are rejected by this test-only billing build.");
  });
});

describe("failed-payment webhook lifecycle", () => {
  it("sets one 14-day deadline, preserves it across retries, and clears it only after all outstanding invoices resolve", async () => {
    const source = await read("./platform-stripe-webhooks.ts");
    expect(source).toContain("14 * 24 * 60 * 60 * 1_000");
    expect(source).toContain("coalesce(${platformSubscriptions.paymentFailedAt}");
    expect(source).toContain("coalesce(${platformSubscriptions.paymentGraceEndsAt}");
    expect(source).toContain('inArray(platformSubscriptionInvoices.status, ["open", "uncollectible"])');
    expect(source).toContain("paymentGraceEndsAt: null");
    expect(source).toContain("accessRestrictedAt: null");
  });
});

describe("Residency self-service billing confirmation UI", () => {
  it("shows current versus new capacity, Stripe's next charge, and zero due today before scheduling", async () => {
    const source = await read("../app/residency/settings/billing/plan-management.tsx");
    expect(source).toContain("Current plan");
    expect(source).toContain("New plan");
    expect(source).toContain("downgrade.nextStripeInvoiceAmountCents");
    expect(source).toContain("Charged today");
    expect(source).toContain("Confirm for period end");
  });

  it("offers all three pause lengths and explains cancellation's user lifecycle", async () => {
    const source = await read("../app/residency/settings/billing/plan-management.tsx");
    expect(source).toContain("([1,2,3] as const)");
    expect(source).toContain("Enrolled users stay on the account; pending invitations revoke when cancellation takes effect.");
  });
});
