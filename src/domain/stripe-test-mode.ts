import { isStagingEnvironment } from "@/lib/deployment-environment";

export type StripeEnvironment = {
  NODE_ENV?: string;
  NEXT_PUBLIC_APP_URL?: string;
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  VERCEL?: string;
  VERCEL_ENV?: string;
  VERCEL_TARGET_ENV?: string;
};

export function assertPlatformBillingStaging(environment: StripeEnvironment) {
  if (environment.VERCEL_ENV?.toLowerCase() === "production") {
    throw new Error("Platform billing is staging-only and is disabled in the production deployment.");
  }
  if (environment.VERCEL && !isStagingEnvironment(environment)) {
    throw new Error("Platform billing can run only in the staging deployment.");
  }
}

/** Fail closed before the Stripe SDK is constructed or any Stripe request runs. */
export function assertStripeTestConfiguration(environment: StripeEnvironment) {
  const secretKey = environment.STRIPE_SECRET_KEY?.trim() ?? "";
  const publishableKey = environment.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("Platform billing requires a Stripe TEST MODE secret key (sk_test_). Live keys are rejected.");
  }
  if (!publishableKey.startsWith("pk_test_")) {
    throw new Error("Platform billing requires a Stripe TEST MODE publishable key (pk_test_). Live keys are rejected.");
  }
  assertPlatformBillingStaging(environment);
  return { secretKey, publishableKey };
}
