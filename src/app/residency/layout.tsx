import { ResidencyShell } from "@/components/residency-shell";
import { getResidencyPaymentFailure } from "@/data/residency-client";
import { requireResidencyActor } from "@/lib/auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ResidencyLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireResidencyActor();
  const paymentFailure = await getResidencyPaymentFailure(actor.residencyId);
  return <ResidencyShell actor={actor}>
    {paymentFailure ? <div className="platform-payment-failure-banner" role="alert"><div><strong>Platform subscription payment failed</strong><span>{paymentFailure.message || "We could not process the latest payment."} Your portal remains fully available.</span></div>{actor.accessRole === "manager" ? <Link href="/residency/settings/billing">Update card</Link> : null}</div> : null}
    {children}
  </ResidencyShell>;
}
