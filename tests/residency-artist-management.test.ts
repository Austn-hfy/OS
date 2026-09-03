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
    expect(archive).toContain("tx.update(residencyTalent).set({ active: false, clientVisible: false })");
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
    expect(page).toContain('canManage={!fullProgramming && actor.accessRole === "manager"}');
    expect(page).toContain('fullProgramming={fullProgramming}');
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

  it("lets a client create and immediately select a roster DJ while scheduling", async () => {
    const [actions, calendar, picker] = await Promise.all([
      readFile(new URL("../src/app/residency/actions.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/artist-search-picker.tsx", import.meta.url), "utf8"),
    ]);
    const create = actions.slice(actions.indexOf("export async function createClientOwnedArtistAction"), actions.indexOf("export async function updateClientOwnedArtistAction"));
    expect(create).toContain("returning({ id: talent.id, stageName: talent.stageName");
    expect(create).toContain("artist: createdArtist");
    expect(calendar).toContain("createClientOwnedArtistAction");
    expect(calendar).toContain("onCreateArtist={canCreateCalendarArtist ? createCalendarArtist : undefined}");
    expect(calendar).toContain('ownership: "residency" as const');
    expect(picker).toContain("Add a new DJ");
    expect(picker).toContain("await onSelect(result.artist.id)");
    expect(picker).not.toContain("<form");
  });

  it("keeps the drawer artist form compact without duplicating its heading", async () => {
    const styles = await readFile(new URL("../src/app/hfy-style-pilot.css", import.meta.url), "utf8");
    expect(styles).toContain(".artist-create-drawer .client-add-artist-heading { display: none; }");
    expect(styles).toContain(".artist-create-drawer .client-add-artist form");
    expect(styles).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
  });

  it("keeps client-safe artist facts and outstanding owed in one compact summary", async () => {
    const [lookup, card, styles] = await Promise.all([
      readFile(new URL("../src/app/residency/talent/client-artist-lookup.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/talent/client-owned-artist-card.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
    ]);
    expect(card).toContain('className="client-artist-profile-row"');
    expect(card).toContain('className="client-artist-facts"');
    expect(card).toContain('className="client-artist-owed-summary"');
    expect(lookup).not.toContain('className="artist-owed-total"');
    expect(lookup).toContain("artist.outstandingAssignments.length > 0");
    expect(styles).toContain("grid-template-columns: repeat(4, minmax(0, 1fr));");
  });

  it("opens client-owned Assignment details and edits the rate from Artist Lookup", async () => {
    const [lookup, data, actions] = await Promise.all([
      readFile(new URL("../src/app/residency/talent/client-artist-lookup.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/data/residency-client.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/actions.ts", import.meta.url), "utf8"),
    ]);
    expect(lookup).toContain("ClientAssignmentRateDialog");
    expect(lookup).toContain("updateClientOwnedRateAction");
    expect(lookup).toContain("Save rate");
    expect(lookup).toContain("Review →");
    expect(data).toContain("defaultRateCents: row.defaultRateCents");
    expect(data).toContain("overrideRateCents: row.overrideRateCents");
    expect(data).toContain("effectiveRateCents: row.effectiveRateCents");
    expect(actions).toContain('revalidatePath("/residency/talent")');
  });

  it("surfaces missing rates on both the artist row and the full Assignment pill without changing Talent navigation", async () => {
    const [lookup, warning, styles, shell] = await Promise.all([
      readFile(new URL("../src/app/residency/talent/client-artist-lookup.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/rate-needed-warning.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/hfy-style-pilot.css", import.meta.url), "utf8"),
      readFile(new URL("../src/components/residency-shell.tsx", import.meta.url), "utf8"),
    ]);
    expect(lookup).toContain("artist.outstandingAssignments.some");
    expect(lookup).toContain('className={assignment.amountCents === null ? "artist-rate-needed-row" : undefined}');
    expect(warning).toContain("Rate needed");
    expect(warning).toContain('aria-hidden="true">!</span>');
    expect(styles).toContain(".artist-owed-list .artist-rate-needed-row");
    expect(shell).toContain('href="/residency/talent" label="Talent"');
    expect(shell).not.toContain('label="Talent" description="Artist lookup" icon="talent" active={pathname === "/residency/talent"} attention=');
  });
});
