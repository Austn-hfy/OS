import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("HFY artist client visibility", () => {
  it("requires explicit client visibility in every Residency client roster query", async () => {
    const source = await readFile(new URL("../src/data/residency-client.ts", import.meta.url), "utf8");
    const roster = source.slice(
      source.indexOf("export async function getResidencyClientSafeRoster"),
      source.indexOf("export async function getResidencyClientOwnedArtistManagement"),
    );
    expect(roster).toContain("eq(residencyTalent.active, true)");
    expect(roster).toContain("eq(residencyTalent.clientVisible, true)");
  });

  it("keeps automatic HFY staffing relationships private by default", async () => {
    const [requests, assignments] = await Promise.all([
      readFile(new URL("../src/services/hfy-talent-requests.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/services/assignments.ts", import.meta.url), "utf8"),
    ]);
    expect(requests).toContain("clientVisible: false");
    expect(assignments.match(/clientVisible: false/g)?.length).toBeGreaterThanOrEqual(2);
    expect(requests).not.toContain("set: { active: true, clientVisible: true");
  });

  it("bulk-removes only client visibility and preserves HFY eligibility", async () => {
    const actions = await readFile(new URL("../src/app/app/actions.ts", import.meta.url), "utf8");
    const bulk = actions.slice(
      actions.indexOf("export async function bulkUpdateArtistsAction"),
      actions.indexOf("export async function updateArtistResidenciesAction"),
    );
    expect(bulk).toContain('operation === "remove_from_client_roster"');
    expect(bulk).toContain("set({ clientVisible: false })");
    expect(bulk).toContain("Existing bookings and payout history were preserved.");
    expect(bulk).not.toContain('operation === "remove_from_client_roster" && parsed.residencyId) {\n        await tx.update(residencyTalent).set({ active: false');
  });

  it("keeps client-owned artists visible when they are created or restored", async () => {
    const actions = await readFile(new URL("../src/app/residency/actions.ts", import.meta.url), "utf8");
    const create = actions.slice(
      actions.indexOf("export async function createClientOwnedArtistAction"),
      actions.indexOf("export async function updateClientOwnedArtistAction"),
    );
    const restore = actions.slice(
      actions.indexOf("export async function restoreClientOwnedArtistAction"),
      actions.indexOf("export async function permanentlyDeleteClientOwnedArtistAction"),
    );
    expect(create).toContain("clientVisible: true");
    expect(restore).toContain("clientVisible: true");
  });
});
