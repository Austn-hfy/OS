import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("client Residency switcher", () => {
  it("is available only to explicit internal test accounts", async () => {
    const shell = await readFile(new URL("../src/components/residency-shell.tsx", import.meta.url), "utf8");

    expect(shell).toContain("actor.isInternalTest && !actor.isViewAs");
    expect(shell).toContain("actor.availableResidencies.map");
  });

  it("uses the light sidebar palette for both Residency context surfaces", async () => {
    const styles = await readFile(new URL("../src/app/hfy-style-pilot.css", import.meta.url), "utf8");
    const context = styles.slice(styles.indexOf(".hfy-style-system .client-residency-context"), styles.indexOf(".hfy-style-system .context-switcher"));
    const testSwitcher = styles.slice(styles.indexOf(".hfy-style-system .internal-test-residency-switcher"), styles.indexOf(".hfy-style-system .privacy-mode-toggle"));

    expect(context).toContain("border-color: var(--hfy-line)");
    expect(context).toContain("color: var(--hfy-ink)");
    expect(context).toContain("small { color: var(--hfy-label); }");
    expect(testSwitcher).toContain("border-color: var(--hfy-line)");
    expect(testSwitcher).toContain("color: var(--hfy-ink)");
  });
});
