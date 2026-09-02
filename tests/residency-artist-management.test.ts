import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Residency-owned artist management", () => {
  it("keeps edit and delete mutations manager-only and scoped to the actor's Residency", async () => {
    const source = await readFile(new URL("../src/app/residency/actions.ts", import.meta.url), "utf8");
    const edit = source.slice(source.indexOf("export async function updateClientOwnedArtistAction"), source.indexOf("export async function deleteClientOwnedArtistAction"));
    const remove = source.slice(source.indexOf("export async function deleteClientOwnedArtistAction"), source.indexOf("export async function updateClientOwnedRateAction"));
    for (const action of [edit, remove]) {
      expect(action).toContain('actor.accessRole !== "manager"');
      expect(action).toContain('eq(talent.ownership, "residency")');
      expect(action).toContain("eq(talent.owningResidencyId, actor.residencyId)");
      expect(action).not.toContain("actor.isViewAs");
    }
  });

  it("soft-deletes artists so historical bookings remain intact", async () => {
    const source = await readFile(new URL("../src/app/residency/actions.ts", import.meta.url), "utf8");
    const remove = source.slice(source.indexOf("export async function deleteClientOwnedArtistAction"), source.indexOf("export async function updateClientOwnedRateAction"));
    expect(remove).toContain('talentStatus: "inactive"');
    expect(remove).toContain("archivedAt: new Date()");
    expect(remove).toContain("tx.update(residencyTalent).set({ active: false })");
    expect(remove).not.toContain("tx.delete(talent)");
    expect(remove).toContain("historyPreserved: true");
  });

  it("shows edit and confirmed-delete controls only to Residency managers", async () => {
    const [page, card] = await Promise.all([
      readFile(new URL("../src/app/residency/talent/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/talent/client-owned-artist-card.tsx", import.meta.url), "utf8"),
    ]);
    expect(page).toContain('canManage={actor.accessRole === "manager"}');
    expect(card).toContain("updateClientOwnedArtistAction");
    expect(card).toContain("deleteClientOwnedArtistAction");
    expect(card).toContain("window.confirm");
    expect(card).toContain("Existing bookings remain intact.");
  });
});
