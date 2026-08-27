import { InternalShell } from "@/components/internal-shell";
import { getResidencyList } from "@/data/internal";
import { requireInternalActor } from "@/lib/auth";
import { PRIVACY_MODE_COOKIE, privacyModeEnabled } from "@/lib/privacy-mode";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [actor, residencies, cookieStore] = await Promise.all([requireInternalActor(), getResidencyList(), cookies()]);
  return <InternalShell actor={actor} residencies={residencies} initialPrivacyMode={privacyModeEnabled(cookieStore.get(PRIVACY_MODE_COOKIE)?.value)}>{children}</InternalShell>;
}
