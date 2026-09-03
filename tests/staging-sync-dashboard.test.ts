import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("staging sync dashboard", () => {
  it("rechecks environment, request host, internal authorization, and the dedicated reader in the POST handler", async () => {
    const route = await source("../src/app/api/internal/staging-sync/route.ts");
    expect(route).toContain("isAllowedStagingSyncRequest(request.nextUrl.hostname");
    expect(route).toContain("getInternalActor()");
    expect(route).toContain("requestOriginHostname(origin)");
    expect(route).toContain("hfy_staging_structure_reader.");
    expect(route).toContain("assertSafeSyncEnvironment(productionDatabaseUrl, stagingDatabaseUrl)");
    expect(route).toContain("verifyStagingSyncConfirmation");
    expect(route).toContain("pg_try_advisory_xact_lock");
    expect(route).not.toContain("PRODUCTION_SYNC_SERVICE_ROLE_KEY");
  });

  it("renders the control only on the stable staging Admin Settings page", async () => {
    const page = await source("../src/app/app/setup/page.tsx");
    const card = await source("../src/app/app/setup/staging-sync-card.tsx");
    expect(page).toContain("isStableStagingSyncEnvironment");
    expect(page).toContain("!selected && stagingSyncEnabled");
    expect(card).toContain("Preview Sync");
    expect(card).toContain("Sync Ace Now");
    expect(card).toContain("I reviewed this preview");
    expect(card).toContain("Nothing runs automatically");
  });
});
