import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Residency-owned artist management", () => {
  it("keeps edit, archive, restore, and permanent-delete mutations manager-only and scoped to the actor's Residency", async () => {
    const source = await readFile(new URL("../src/app/residency/actions.ts", import.meta.url), "utf8");
    const edit = source.slice(source.indexOf("export async function updateClientOwnedArtistAction"), source.indexOf("export async function archiveClientOwnedArtistAction"));
    const archive = source.slice(source.indexOf("export async function archiveClientOwnedArtistAction"), source.indexOf("export async function restoreClientOwnedArtistAction"));
    const restore = source.slice(source.indexOf("export async function restoreClientOwnedArtistAction"), source.indexOf("export async function permanentlyDeleteClientOwnedArtistAction"));
    const remove = source.slice(source.indexOf("export async function permanentlyDeleteClientOwnedArtistAction"), source.indexOf("export async function updateClientOwnedRateAction"));
    for (const action of [edit, archive, restore, remove]) {
      expect(action).toContain('actor.accessRole !== "manager"');
      expect(action).toContain('eq(talent.ownership, "residency")');
      expect(action).toContain("eq(talent.owningResidencyId, actor.residencyId)");
    }
  });

  it("archives by default and only permanently deletes records without history", async () => {
    const source = await readFile(new URL("../src/app/residency/actions.ts", import.meta.url), "utf8");
    const archive = source.slice(source.indexOf("export async function archiveClientOwnedArtistAction"), source.indexOf("export async function restoreClientOwnedArtistAction"));
    const remove = source.slice(source.indexOf("export async function permanentlyDeleteClientOwnedArtistAction"), source.indexOf("export async function updateClientOwnedRateAction"));
    expect(archive).toContain('talentStatus: "inactive"');
    expect(archive).toContain("archivedAt: new Date()");
    expect(archive).toContain("tx.update(residencyTalent).set({ active: false })");
    expect(archive).not.toContain("tx.delete(talent)");
    expect(archive).toContain("historyPreserved: true");
    expect(remove).toContain("assignmentHistory.length || occurrenceHistory.length");
    expect(remove).toContain("must remain archived");
    expect(remove).toContain("tx.delete(talent)");
  });

  it("shows edit, archive, restore, and protected permanent-delete controls only to Residency managers", async () => {
    const [page, lookup, card] = await Promise.all([
      readFile(new URL("../src/app/residency/talent/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/talent/client-artist-lookup.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/talent/client-owned-artist-card.tsx", import.meta.url), "utf8"),
    ]);
    expect(page).toContain('canManage={actor.accessRole === "manager"}');
    expect(card).toContain("updateClientOwnedArtistAction");
    expect(card).toContain("archiveClientOwnedArtistAction");
    expect(card).toContain("restoreClientOwnedArtistAction");
    expect(card).toContain("permanentlyDeleteClientOwnedArtistAction");
    expect(card).toContain("window.confirm");
    expect(card).toContain("Archive Artist");
    expect(lookup).toContain('{ id: "archived", label: "Archived" }');
    expect(lookup).toContain("ArchivedClientOwnedArtistCard");
  });

  it("records and exposes only the safe creator-source distinction", async () => {
    const [actions, data, card] = await Promise.all([
      readFile(new URL("../src/app/residency/actions.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/data/residency-client.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/talent/client-owned-artist-card.tsx", import.meta.url), "utf8"),
    ]);
    const create = actions.slice(actions.indexOf("export async function createClientOwnedArtistAction"), actions.indexOf("export async function updateClientOwnedArtistAction"));
    const management = data.slice(data.indexOf("export async function getResidencyClientOwnedArtistManagement"), data.indexOf("export async function getResidencyClientVisibleAccessContacts"));
    expect(create).toContain('creationSource: actor.isViewAs ? "hfy_on_behalf" : "residency_member"');
    expect(management).toContain('creation?.actorRole === "internal_admin"');
    expect(management).not.toContain("actorLabel:");
    expect(card).toContain("Added by HFY on behalf of");
    expect(card).toContain("Added by the");
  });
});
