import { redirect } from "next/navigation";
import { ResidencyPageBody, ResidencyPageHeader, ResidencyPageSurface, ResidencyTabs } from "@/components/residency-design-system";
import { ResidencySettingsForm } from "./settings-form";
import { getResidencyClientSettings } from "@/data/residency-client";
import { getResidencyUsers } from "@/data/residency-users";
import { canResidencyRoleAccess } from "@/domain/residency-access";
import { requireResidencyActor } from "@/lib/auth";
import { isCurrentPlatformBillingAvailable } from "@/lib/platform-billing-stage";
import { UsersAndRoles } from "./users-and-roles";
import { AccountSecurity } from "./account-security";

export default async function ResidencySettingsPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const platformBillingAvailable = isCurrentPlatformBillingAvailable();
  const actor = await requireResidencyActor();
  if (!canResidencyRoleAccess(actor.accessRole, "settings")) redirect("/residency/access-limited");
  const [settings, users, query] = await Promise.all([getResidencyClientSettings(actor.residencyId), getResidencyUsers(actor.residencyId), searchParams]);
  return <ResidencyPageSurface className="workspace-surface-settings workspace-surface-client-settings">
    <ResidencyPageHeader eyebrow="Settings · Account" title="Account settings" />
    <ResidencyTabs className="settings-tabs" ariaLabel="Settings sections" activeHref="/residency/settings" items={[{ href: "/residency/settings", label: "Account" }, ...(platformBillingAvailable ? [{ href: "/residency/settings/billing", label: "Billing" }] : [])]} />
    <ResidencyPageBody className="settings-page-body settings-account-body">
      <ResidencySettingsForm settings={settings} />
      {query.email === "confirmed" ? <p className="success" role="status">Your login email has been confirmed and updated.</p> : null}
      <UsersAndRoles users={users} currentUserId={actor.userId} />
      <AccountSecurity email={actor.email} />
    </ResidencyPageBody>
  </ResidencyPageSurface>;
}
