import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResidencyActor } from "@/lib/auth";
import { ResidencyShell } from "./residency-shell";

vi.mock("next/navigation", () => ({ usePathname: vi.fn(() => "/residency") }));
vi.mock("@/app/actions", () => ({
  signOut: vi.fn(),
  switchInternalTestResidency: vi.fn(),
}));
vi.mock("@/app/app/view-as-actions", () => ({ exitViewAsAction: vi.fn() }));

const manager: ResidencyActor = {
  kind: "residency",
  userId: "user-1",
  email: "manager@example.com",
  displayName: "Residency Manager",
  residencyId: "residency-1",
  residencyName: "Test Residency",
  residencyTimezone: "America/Los_Angeles",
  residencyTier: "operations_only",
  accessRole: "manager",
  isViewAs: false,
  isInternalTest: false,
  availableResidencies: [],
};

function renderShell(actor: ResidencyActor, platformBillingAvailable: boolean) {
  const TestResidencyShell = ResidencyShell as ComponentType<{
    actor: ResidencyActor;
    platformBillingAvailable: boolean;
    children?: ReactNode;
  }>;
  return renderToStaticMarkup(createElement(
    TestResidencyShell,
    { actor, platformBillingAvailable },
    createElement("div", null, "Workspace content"),
  ));
}

describe("Residency shell Overview navigation", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([true, false])("keeps Overview and the manager home link available when billing availability is %s", (platformBillingAvailable) => {
    const html = renderShell(manager, platformBillingAvailable);

    expect(html.match(/href="\/residency"/g)).toHaveLength(2);
    expect(html).toContain("Overview");
    expect(html).toContain("Program status and next steps");
  });

  it.each([true, false])("keeps calendar viewers on Calendar when billing availability is %s", (platformBillingAvailable) => {
    const html = renderShell({ ...manager, accessRole: "calendar_viewer" }, platformBillingAvailable);

    expect(html).not.toContain("Overview");
    expect(html).not.toContain("Program status and next steps");
    expect(html).toContain('class="brand" href="/residency/calendar"');
  });
});
