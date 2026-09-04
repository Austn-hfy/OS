import { ResidencyShell } from "@/components/residency-shell";
import { PrivacyModeProvider } from "@/components/privacy-mode";
import { requireResidencyActor } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ResidencyLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireResidencyActor();
  return (
    <PrivacyModeProvider initialEnabled={false}>
      <ResidencyShell actor={actor}>{children}</ResidencyShell>
    </PrivacyModeProvider>
  );
}
