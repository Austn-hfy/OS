import { ResidencyShell } from "@/components/residency-shell";
import { PrivacyModeProvider } from "@/components/privacy-mode";
import { getResidencyPaymentFailure } from "@/data/residency-client";
import { requireResidencyActor } from "@/lib/auth";
import { isCurrentPlatformBillingAvailable } from "@/lib/platform-billing-stage";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ResidencyLayout({ children }: { children: React.ReactNode }) {
  const platformBillingAvailable = isCurrentPlatformBillingAvailable();
  const actor = await requireResidencyActor();
  const paymentFailure = platformBillingAvailable ? await getResidencyPaymentFailure(actor.residencyId) : null;
  const deadline = paymentFailure?.graceEndsAt ? `${new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(paymentFailure.graceEndsAt))} UTC` : null;
  return <PrivacyModeProvider initialEnabled={false}>
    <ResidencyShell actor={actor} platformBillingAvailable={platformBillingAvailable}>
      {paymentFailure ? <div className={`platform-payment-failure-banner ${paymentFailure.restrictedAt ? "restricted" : ""}`} role="alert"><div><strong>{paymentFailure.restrictedAt ? "Payment overdue — operational changes restricted" : "Platform subscription payment failed"}</strong><span>{paymentFailure.message || "We could not process the latest payment."} {paymentFailure.restrictedAt ? "Your data remains available; payment restores operational changes." : `Full access continues${deadline ? ` through ${deadline}` : " during the 14-day grace period"}.`}</span></div>{actor.accessRole === "manager" ? <Link href="/residency/settings/billing">Resolve payment</Link> : null}</div> : null}
      {children}
    </ResidencyShell>
  </PrivacyModeProvider>;
}
