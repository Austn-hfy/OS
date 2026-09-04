import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("owner View As safety", () => {
  it("routes View As through the exact real Residency-member route tree and shell", async () => {
    const [viewAsActions, residencyLayout, internalShell, internalCalendar] = await Promise.all([
      readFile(new URL("../src/app/app/view-as-actions.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/layout.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/internal-shell.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/app/calendar/page.tsx", import.meta.url), "utf8"),
    ]);
    expect(viewAsActions).toContain('redirect("/residency/calendar")');
    expect(residencyLayout).toContain('import { PrivacyModeProvider } from "@/components/privacy-mode";');
    expect(residencyLayout).toContain("<PrivacyModeProvider initialEnabled={false}>");
    expect(residencyLayout).toContain("<ResidencyShell actor={actor}>");
    expect(residencyLayout.indexOf("<PrivacyModeProvider")).toBeLessThan(
      residencyLayout.indexOf("<ResidencyShell"),
    );
    expect(internalShell).not.toContain("if (viewAsResidency)");
    expect(internalShell).not.toContain("Residency preview");
    expect(internalCalendar).not.toContain("viewAsResidencyId");
    expect(internalCalendar).not.toContain("previewResidencyId");
  });

  it("keeps every client page independent of preview state so both actors render the same pages", async () => {
    const clientPages = [
      "../src/app/residency/page.tsx",
      "../src/app/residency/calendar/page.tsx",
      "../src/app/residency/talent/page.tsx",
      "../src/app/residency/talent/roster/page.tsx",
      "../src/app/residency/payouts/page.tsx",
      "../src/app/residency/invoices/page.tsx",
      "../src/app/residency/settings/page.tsx",
    ];
    const sources = await Promise.all(clientPages.map((page) => readFile(new URL(page, import.meta.url), "utf8")));
    for (const source of sources) {
      expect(source).toContain("requireResidencyActor");
      expect(source).not.toContain("isViewAs");
      expect(source).not.toContain("viewAsResidencyId");
    }
  });

  it("marks an owner preview as a Residency actor before shared manager actions run", async () => {
    const source = await readFile(new URL("../src/lib/auth.ts", import.meta.url), "utf8");
    expect(source).toContain('current.profile.role === "internal_admin"');
    expect(source).toContain("isViewAs: true");
    expect(source).toContain("if (await viewAsResidencyId() === residencyId)");
    expect(source).toContain("return previewActor");
  });

  it("lets the developer perform the same Residency-scoped manager actions while View As is active", async () => {
    const [actions, shell] = await Promise.all([
      readFile(new URL("../src/app/residency/actions.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/components/residency-shell.tsx", import.meta.url), "utf8"),
    ]);
    expect(actions).toContain('actor.accessRole !== "manager"');
    expect(actions).not.toContain("if (actor.isViewAs)");
    expect(actions).not.toContain("Exit client preview");
    expect(actions).toContain('ownership: "residency"');
    expect(actions).toContain("owningResidencyId: actor.residencyId");
    expect(actions).toContain("exclusiveResidencyId: actor.residencyId");
    expect(actions).toContain("residencyId: actor.residencyId");
    expect(shell).toContain("Changes made here are live for this Residency.");
  });
});
