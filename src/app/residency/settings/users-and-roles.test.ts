import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

describe("Residency Users & Roles account experience", () => {
  it("uses the approved layered person cards and card-width-responsive layout", async () => {
    const css = await read("../../../app/globals.css");
    expect(css).toContain(".residency-users-card { container: residency-users / inline-size; }");
    expect(css).toContain(".residency-user-invite-form { display: grid; min-width: 0;");
    expect(css).toContain(".residency-user-card-top { min-width: 0; display: flex;");
    expect(css).toContain(".residency-user-card-bottom { min-width: 0; display: grid;");
    expect(css).toContain("grid-template-columns: minmax(220px, .75fr) minmax(0, 1.25fr)");
    expect(css).toContain("@container residency-users (max-width: 860px)");
    expect(css).toContain("@container residency-users (max-width: 560px)");
    expect(css).toContain(".residency-user-invite-form, .residency-user-card-bottom { grid-template-columns: minmax(0, 1fr); }");
    expect(css).toContain(".residency-user-card-top { align-items: flex-start; flex-direction: column; }");
  });

  it("defaults bulk invitations to Calendar viewer and explains both roles at assignment time", async () => {
    const [actions, component, settingsForm] = await Promise.all([read("./actions.ts"), read("./users-and-roles.tsx"), read("./settings-form.tsx")]);
    expect(actions).toContain('.default("calendar_viewer")');
    expect(actions).toContain("split(/[\\n,]+/)");
    expect(component).toContain("Calendar only. No Account, Billing, Talent, or Finances access.");
    expect(component).toContain("Full workspace, Account, users, roles, and Billing.");
    expect(component).toContain("{users.length} of 4 seats");
    expect(settingsForm).not.toContain("primaryContactName");
    expect(settingsForm).not.toContain("primaryContactPhone");
    expect(settingsForm).not.toContain("primaryContactEmail");
  });

  it("shows pending and enrolled states, inviter, role audit, and state-specific actions", async () => {
    const [component, actions, service] = await Promise.all([read("./users-and-roles.tsx"), read("./actions.ts"), read("../../../services/residency-users.ts")]);
    expect(component).toContain("Invitation pending");
    expect(component).toContain("Enrolled");
    expect(component).toContain("Invited ");
    expect(component).toContain("roleHistory[0]");
    expect(component).toContain(">Resend invite<");
    expect(component).toContain(">Reset password<");
    expect(component).toContain(">Revoke<");
    expect(component).toContain(">Remove<");
    expect(actions).toContain("requestResidencyUserPasswordResetAction");
    expect(service).toContain("requestResidencyUserPasswordReset");
    expect(service).toContain("resetPasswordForEmail");
  });

  it("implements client View As as a read-only preview enforced at the mutation boundary", async () => {
    const [auth, shell, viewAs] = await Promise.all([read("../../../lib/auth.ts"), read("../../../components/residency-shell.tsx"), read("./client-view-as-actions.ts")]);
    expect(auth).toContain("if (actor.isClientViewAs) throw new ResidencyAccessError(403");
    expect(shell).toContain("Read-only preview");
    expect(shell).toContain("Viewing as {actor.viewAsDisplayName}");
    expect(viewAs).toContain("CLIENT_VIEW_AS_MEMBERSHIP_COOKIE");
    expect(viewAs).toContain('redirect("/residency/calendar")');
  });

  it("activates an accepted invitation as a real membership and reconciles the primary business contact", async () => {
    const [setup, form] = await Promise.all([read("../../../services/account-setup.ts"), read("../../setup-account/setup-account-form.tsx")]);
    expect(setup).toContain("residencyMemberships).set({ active: true");
    expect(setup).toContain('invitationStatus: "active"');
    expect(setup).toContain("primaryContactName: profile.name");
    expect(form).toContain('name="name"');
    expect(form).toContain('name="phone"');
  });

  it("supports a confirmed own-email change and current-password reauthentication", async () => {
    const [security, callback] = await Promise.all([read("./account-security.tsx"), read("../../auth/callback/route.ts")]);
    expect(security).toContain("current_password: currentPassword");
    expect(security).toContain('name="email"');
    expect(callback).toContain("residency_user_email_changed");
    expect(callback).toContain("primaryContactEmail: confirmedEmail");
  });
});
