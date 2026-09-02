import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Developer Residency contact management", () => {
  it("requires an internal actor and removes every Residency-scoped access path", async () => {
    const source = await readFile(new URL("../src/app/app/actions.ts", import.meta.url), "utf8");
    const action = source.slice(
      source.indexOf("export async function removeResidencyContactAction"),
      source.indexOf("export async function inviteResidencyContactAction"),
    );

    expect(action).toContain("requireInternalActor()");
    expect(action).toContain("tx.update(residencyMemberships).set({ active: false })");
    expect(action).toContain("tx.update(accountSetupTokens).set({ revokedAt: removedAt })");
    expect(action).toContain('action: "residency_contact_removed"');
    expect(action).toContain("tx.delete(residencyContacts)");
    expect(action).toContain('eq(users.role, "hotel_user")');
  });

  it("warns before removal and explains the Residency-scoped effect", async () => {
    const source = await readFile(new URL("../src/app/app/setup/residency-contacts-manager.tsx", import.meta.url), "utf8");

    expect(source).toContain("window.confirm");
    expect(source).toContain("Access to any other Residency will not be affected");
    expect(source).toContain("Remove contact");
  });
});
