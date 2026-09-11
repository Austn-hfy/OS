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
  return <PrivacyModeProvider initialEnabled={false}>
    <ResidencyShell actor={actor} platformBillingAvailable={platformBillingAvailable}>
      {paymentFailure ? <div className="platform-payment-failure-banner" role="alert"><div><strong>Platform subscription payment failed</strong><span>{paymentFailure.message || "We could not process the latest payment."} Your portal remains fully available.</span></div>{actor.accessRole === "manager" ? <Link href="/residency/settings/billing">Update card</Link> : null}</div> : null}
      {children}
    </ResidencyShell>
  </PrivacyModeProvider>;
}
