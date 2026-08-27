import { ResidencyShell } from "@/components/residency-shell";
import { requireResidencyActor } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ResidencyLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireResidencyActor();
  return <ResidencyShell actor={actor}>{children}</ResidencyShell>;
}
