import { InternalShell } from "@/components/internal-shell";
import { getDeveloperResidencyList, getResidencyList } from "@/data/internal";
import { requireInternalActor } from "@/lib/auth";
import { PRIVACY_MODE_COOKIE, privacyModeEnabled } from "@/lib/privacy-mode";
import { cookies } from "next/headers";
import { viewAsResidencyId } from "@/lib/view-as";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [actor, residencies, developerResidencies, cookieStore, requestedViewAsResidencyId] = await Promise.all([
    requireInternalActor(),
    getResidencyList(),
    getDeveloperResidencyList(),
    cookies(),
    viewAsResidencyId(),
  ]);
  const viewAsResidency = developerResidencies.find((residency) => residency.id === requestedViewAsResidencyId) ?? null;
  if (viewAsResidency) redirect("/residency/calendar");
  return <InternalShell actor={actor} residencies={residencies} developerResidencies={developerResidencies} initialPrivacyMode={privacyModeEnabled(cookieStore.get(PRIVACY_MODE_COOKIE)?.value)}>{children}</InternalShell>;
}
