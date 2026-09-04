import "server-only";

import { assertPlatformBillingStaging } from "@/domain/stripe-test-mode";

export function assertCurrentPlatformBillingStaging() {
  assertPlatformBillingStaging({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_TARGET_ENV: process.env.VERCEL_TARGET_ENV,
  });
}
