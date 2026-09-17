import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

describe("Residency Account surface layering", () => {
  it("places both Account sections in Billing-matched Surface cards and keeps the form footer outside", async () => {
    const [form, component, styles, tokens, audit] = await Promise.all([
      readSource("../src/app/residency/settings/settings-form.tsx"),
      readSource("../src/components/residency-design-system.tsx"),
      readSource("../src/app/hfy-style-pilot.css"),
      readSource("../src/app/hfy-design-tokens.css"),
      readSource("../docs/UI_UX_DESKTOP_AUDIT_CLIENT_RESIDENCY.md"),
    ]);

    expect(form.match(/<ResidencySurfaceCard className="settings-account-section">/g)).toHaveLength(2);
    expect(form.indexOf("<footer>")).toBeGreaterThan(form.lastIndexOf("settings-account-section"));
    expect(component).toContain('classes("card", "residency-surface-card"');
    expect(styles).toContain(".settings-account-section");
    expect(tokens).toContain("--hfy-surface-card-radius: 16px;");
    expect(tokens).toContain("--hfy-surface-card-shadow: 0 8px 24px rgba(26, 55, 84, 0.06);");
    expect(audit).toContain("Layer structure — locked sitewide rule");
    expect(audit).toContain("Account was the first confirmed violation");
  });
});
