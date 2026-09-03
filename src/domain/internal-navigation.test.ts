import { describe, expect, it } from "vitest";
import { isInternalNavigationItemActive } from "./internal-navigation";

const residencies = { label: "Residencies", href: "/app?mode=developer" };
const committedPlans = {
  label: "Committed Plans",
  href: "/app?mode=developer&section=committed-plans#committed-plans",
};

function developerLocation(section: string | null) {
  return {
    mode: "developer" as const,
    pathname: "/app",
    residencyId: null,
    section,
    view: null,
  };
}

describe("internal navigation active state", () => {
  it("highlights only Residencies on the default Developer dashboard", () => {
    const location = developerLocation(null);

    expect(isInternalNavigationItemActive(residencies, location)).toBe(true);
    expect(isInternalNavigationItemActive(committedPlans, location)).toBe(false);
  });

  it("highlights only Committed Plans when its dashboard section is selected", () => {
    const location = developerLocation("committed-plans");

    expect(isInternalNavigationItemActive(residencies, location)).toBe(false);
    expect(isInternalNavigationItemActive(committedPlans, location)).toBe(true);
  });
});
