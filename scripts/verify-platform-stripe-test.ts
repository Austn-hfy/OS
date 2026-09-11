import Stripe from "stripe";
import { assertStripeTestConfiguration } from "../src/domain/stripe-test-mode";

const apply = process.argv.includes("--apply");
const { secretKey } = assertStripeTestConfiguration({
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});
const stripe = new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 20_000 });
const balance = await stripe.balance.retrieve();
if (balance.livemode) throw new Error("Stripe returned live-mode data. Verification stopped before creating anything.");
if (!apply) {
  console.log("Stripe test-mode connectivity verified. Re-run with --apply for the disposable subscription lifecycle test.");
  process.exit(0);
}

let customerId: string | null = null;
let failureCustomerId: string | null = null;
let productId: string | null = null;
let subscriptionId: string | null = null;
let scheduleId: string | null = null;
const priceIds: string[] = [];
const checkoutSessionIds: string[] = [];

try {
  const runId = new Date().toISOString();
  const customer = await stripe.customers.create({
    email: "platform-billing-verification@example.test",
    name: "HFY Platform Billing Verification",
    metadata: { environment: "staging-test", disposable_verification: runId },
  });
  if (customer.livemode) throw new Error("Live-mode Customer returned; verification stopped.");
  customerId = customer.id;
  const successPaymentMethod = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
  await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: successPaymentMethod.id } });

  const product = await stripe.products.create({
    name: "HFY Platform Billing Disposable Verification",
    metadata: { environment: "staging-test", disposable_verification: runId },
  });
  if (product.livemode) throw new Error("Live-mode Product returned; verification stopped.");
  productId = product.id;

  const firstPrice = await stripe.prices.create({ currency: "usd", product: product.id, unit_amount: 27_500, recurring: { interval: "month" }, metadata: { environment: "staging-test" } });
  const replacementPrice = await stripe.prices.create({ currency: "usd", product: product.id, unit_amount: 30_000, recurring: { interval: "month" }, metadata: { environment: "staging-test" } });
  const quarterlyPrice = await stripe.prices.create({ currency: "usd", product: product.id, unit_amount: 90_000, recurring: { interval: "month", interval_count: 3 }, metadata: { environment: "staging-test" } });
  if (firstPrice.livemode || replacementPrice.livemode || quarterlyPrice.livemode) throw new Error("Live-mode Price returned; verification stopped.");
  priceIds.push(firstPrice.id, replacementPrice.id, quarterlyPrice.id);

  const subscriptionCheckout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customer.id,
    payment_method_types: ["card"],
    payment_method_collection: "always",
    billing_address_collection: "auto",
    customer_update: { address: "auto", name: "auto" },
    line_items: [{ quantity: 1, price: firstPrice.id }],
    subscription_data: { metadata: { environment: "staging-test", committed_plan_revision: "1" }, invoice_settings: { issuer: { type: "self" } } },
    success_url: "https://staging.hfy.app/residency/settings/billing?stripe=success",
    cancel_url: "https://staging.hfy.app/residency/settings/billing?stripe=cancelled",
  });
  if (subscriptionCheckout.livemode || subscriptionCheckout.mode !== "subscription" || !subscriptionCheckout.url) throw new Error("Hosted test Subscription Checkout was not created correctly.");
  checkoutSessionIds.push(subscriptionCheckout.id);
  await stripe.checkout.sessions.expire(subscriptionCheckout.id);

  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: firstPrice.id }],
    default_payment_method: successPaymentMethod.id,
    payment_behavior: "error_if_incomplete",
    metadata: { environment: "staging-test", hfy_platform_subscription_id: "disposable-verification" },
    expand: ["latest_invoice"],
  });
  if (subscription.livemode) throw new Error("Live-mode Subscription returned; verification stopped.");
  subscriptionId = subscription.id;
  const item = subscription.items.data[0];
  if (!item) throw new Error("Disposable test Subscription did not create an item.");

  const updated = await stripe.subscriptions.update(subscription.id, {
    items: [{ id: item.id, price: replacementPrice.id }],
    proration_behavior: "none",
    metadata: { ...subscription.metadata, committed_plan_revision: "2", environment: "staging-test" },
  });
  if (updated.id !== subscription.id) throw new Error("Stripe replaced the Subscription instead of updating the existing ID.");
  if (updated.items.data[0]?.price.id !== replacementPrice.id) throw new Error("Stripe did not apply the replacement test Price in place.");

  const updatedItem = updated.items.data[0];
  if (!updatedItem) throw new Error("Updated test Subscription has no item.");
  const schedule = await stripe.subscriptionSchedules.create({ from_subscription: subscription.id });
  if (schedule.livemode) throw new Error("Live-mode Subscription Schedule returned; verification stopped.");
  scheduleId = schedule.id;
  const currentStart = schedule.current_phase?.start_date ?? updatedItem.current_period_start;
  const currentEnd = schedule.current_phase?.end_date ?? updatedItem.current_period_end;
  const scheduled = await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: "release",
    proration_behavior: "none",
    phases: [
      { start_date: currentStart, end_date: currentEnd, items: [{ price: replacementPrice.id, quantity: 1 }], proration_behavior: "none" },
      { start_date: currentEnd, duration: { interval: "month", interval_count: 3 }, items: [{ price: quarterlyPrice.id, quantity: 1 }], proration_behavior: "none", metadata: { environment: "staging-test", committed_plan_revision: "3" } },
    ],
  });
  const scheduledSubscriptionId = typeof scheduled.subscription === "string" ? scheduled.subscription : scheduled.subscription?.id;
  if (scheduledSubscriptionId !== subscription.id) throw new Error("Cadence scheduling replaced the existing Stripe Subscription.");
  if (scheduled.phases[1]?.items[0]?.price !== quarterlyPrice.id) throw new Error("Quarterly cadence was not scheduled on the existing Subscription.");

  const setupCheckout = await stripe.checkout.sessions.create({
    mode: "setup",
    customer: customer.id,
    payment_method_types: ["card"],
    metadata: { environment: "staging-test", stripe_subscription_id: subscription.id, purpose: "update_platform_subscription_card" },
    success_url: "https://staging.hfy.app/residency/settings/billing?card=updated",
    cancel_url: "https://staging.hfy.app/residency/settings/billing?card=cancelled",
  });
  if (setupCheckout.livemode || setupCheckout.mode !== "setup" || !setupCheckout.url) throw new Error("Hosted test card-update Checkout was not created correctly.");
  checkoutSessionIds.push(setupCheckout.id);
  await stripe.checkout.sessions.expire(setupCheckout.id);

  const failureCustomer = await stripe.customers.create({
    email: "platform-billing-failure-verification@example.test",
    name: "HFY Platform Billing Failure Verification",
    metadata: { environment: "staging-test", disposable_verification: runId },
  });
  if (failureCustomer.livemode) throw new Error("Live-mode failure-test Customer returned; verification stopped.");
  failureCustomerId = failureCustomer.id;
  const failurePaymentMethod = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", { customer: failureCustomer.id });
  let expectedFailureObserved = false;
  try {
    await stripe.paymentIntents.create({
      amount: 1_000,
      currency: "usd",
      customer: failureCustomer.id,
      payment_method: failurePaymentMethod.id,
      confirm: true,
      off_session: true,
      description: "Disposable Platform failed-payment verification",
      metadata: { environment: "staging-test" },
    });
  } catch (error) {
    expectedFailureObserved = error instanceof Stripe.errors.StripeCardError || (error instanceof Error && /declin|card/i.test(error.message));
  }
  if (!expectedFailureObserved) throw new Error("The Stripe decline-after-attaching test PaymentMethod did not produce the expected failure.");

  console.log(`Stripe test-mode lifecycle verified: hosted subscription/card Checkouts created, paid subscription created, amount updated in place, quarterly cadence scheduled on the same subscription, and attached-card failure simulated. Subscription ID remained ${subscription.id}.`);
} finally {
  for (const sessionId of checkoutSessionIds) await stripe.checkout.sessions.expire(sessionId).catch(() => undefined);
  if (scheduleId) await stripe.subscriptionSchedules.release(scheduleId).catch(() => undefined);
  if (subscriptionId) await stripe.subscriptions.cancel(subscriptionId, { invoice_now: false, prorate: false }).catch(() => undefined);
  for (const priceId of priceIds) await stripe.prices.update(priceId, { active: false }).catch(() => undefined);
  if (customerId) await stripe.customers.del(customerId).catch(() => undefined);
  if (failureCustomerId) await stripe.customers.del(failureCustomerId).catch(() => undefined);
  if (productId) await stripe.products.del(productId).catch(() => undefined);
}
