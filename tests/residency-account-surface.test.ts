import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

describe("Residency Account surface layering", () => {
  it("places Account, Users, and Security in Billing-matched Surface cards", async () => {
    const [form, users, security, page, component, styles, tokens, audit] = await Promise.all([
      readSource("../src/app/residency/settings/settings-form.tsx"),
      readSource("../src/app/residency/settings/users-and-roles.tsx"),
      readSource("../src/app/residency/settings/account-security.tsx"),
      readSource("../src/app/residency/settings/page.tsx"),
      readSource("../src/components/residency-design-system.tsx"),
      readSource("../src/app/hfy-style-pilot.css"),
      readSource("../src/app/hfy-design-tokens.css"),
      readSource("../docs/UI_UX_DESKTOP_AUDIT_CLIENT_RESIDENCY.md"),
    ]);

    expect(form.match(/<ResidencySurfaceCard className="settings-account-section">/g)).toHaveLength(1);
    expect(form.indexOf("<footer>")).toBeGreaterThan(form.lastIndexOf("settings-account-section"));
    expect(users).toContain('ResidencySurfaceCard className="settings-account-section residency-users-card"');
    expect(security).toContain('ResidencySurfaceCard className="settings-account-section account-security-card"');
    expect(page).toContain("<UsersAndRoles");
    expect(page).toContain("<AccountSecurity");
    expect(component).toContain('classes("card", "residency-surface-card"');
    expect(styles).toContain(".settings-account-section");
    expect(tokens).toContain("--hfy-surface-card-radius: 16px;");
    expect(tokens).toContain("--hfy-surface-card-shadow: 0 8px 24px rgba(26, 55, 84, 0.06);");
    expect(audit).toContain("Layer structure — locked sitewide rule");
    expect(audit).toContain("Account was the first confirmed violation");
  });
});
