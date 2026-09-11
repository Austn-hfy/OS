import "server-only";

import Stripe from "stripe";
import { assertStripeTestConfiguration } from "@/domain/stripe-test-mode";
import { requiredEnv } from "@/lib/env";

export function currentStripeTestConfiguration() {
  return assertStripeTestConfiguration({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_TARGET_ENV: process.env.VERCEL_TARGET_ENV,
  });
}

let client: Stripe | null = null;

export function getStripe() {
  const { secretKey } = currentStripeTestConfiguration();
  if (!client) client = new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 20_000 });
  return client;
}

export function stripeWebhookSecret() {
  currentStripeTestConfiguration();
  const secret = requiredEnv("STRIPE_WEBHOOK_SECRET");
  if (!secret.startsWith("whsec_")) throw new Error("STRIPE_WEBHOOK_SECRET is not a Stripe webhook signing secret.");
  return secret;
}

export function stagingBillingReturnUrl(path: string) {
  currentStripeTestConfiguration();
  const base = new URL(requiredEnv("NEXT_PUBLIC_APP_URL"));
  if (base.protocol !== "https:" && base.hostname !== "localhost" && base.hostname !== "127.0.0.1") {
    throw new Error("Platform billing return URLs must use HTTPS outside local development.");
  }
  return new URL(path, base).toString();
}
