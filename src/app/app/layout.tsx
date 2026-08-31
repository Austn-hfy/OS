import { InternalShell } from "@/components/internal-shell";
import { getResidencyList } from "@/data/internal";
import { requireInternalActor } from "@/lib/auth";
import { PRIVACY_MODE_COOKIE, privacyModeEnabled } from "@/lib/privacy-mode";
import { cookies } from "next/headers";
import { viewAsResidencyId } from "@/lib/view-as";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [actor, residencies, cookieStore, requestedViewAsResidencyId] = await Promise.all([requireInternalActor(), getResidencyList(), cookies(), viewAsResidencyId()]);
  const viewAsResidency = residencies.find((residency) => residency.id === requestedViewAsResidencyId) ?? null;
  if (viewAsResidency) redirect("/residency/calendar");
  return <InternalShell actor={actor} residencies={residencies} initialPrivacyMode={privacyModeEnabled(cookieStore.get(PRIVACY_MODE_COOKIE)?.value)}>{children}</InternalShell>;
}
