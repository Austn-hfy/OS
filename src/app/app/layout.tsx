import { InternalShell } from "@/components/internal-shell";
import { getResidencyList } from "@/data/internal";
import { requireInternalActor } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [actor, residencies] = await Promise.all([requireInternalActor(), getResidencyList()]);
  return <InternalShell actor={actor} residencies={residencies}>{children}</InternalShell>;
}
