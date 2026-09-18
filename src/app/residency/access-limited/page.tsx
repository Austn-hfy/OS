import Link from "next/link";
import { ResidencyPageBody, ResidencyPageHeader, ResidencyPageSurface, ResidencySurfaceCard } from "@/components/residency-design-system";
import { requireResidencyActor } from "@/lib/auth";

export default async function ResidencyAccessLimitedPage() {
  const actor = await requireResidencyActor();
  return <ResidencyPageSurface>
    <ResidencyPageHeader eyebrow="Access" title="Calendar-only access" />
    <ResidencyPageBody>
      <ResidencySurfaceCard className="residency-access-limited">
        <h2>This area is not included in your role</h2>
        <p><strong>{actor.viewAsDisplayName || actor.email}</strong> has the Calendar viewer role. Calendar viewers can see the Residency calendar, but cannot open Account, Billing, Finances, Talent, or operational settings.</p>
        <p>Ask a Residency manager if you need administrative access.</p>
        <Link className="button" href="/residency/calendar">Return to Calendar</Link>
      </ResidencySurfaceCard>
    </ResidencyPageBody>
  </ResidencyPageSurface>;
}
