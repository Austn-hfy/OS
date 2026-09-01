import { describe, expect, it } from "vitest";
import { projectClientSafeTalent } from "./client-safe-talent";

describe("client-safe talent boundary", () => {
  it("drops financial, payment, tax, contact, and internal fields even if the source expands", () => {
    const result = projectClientSafeTalent({
      id: "4fba74ec-d8d4-46d1-aecc-b560e12dca44",
      stageName: "Safe Artist",
      homeMarket: "Palm Springs",
      genres: ["House"],
      instagramHandle: "@safeartist",
      clientContact: "client-visible@example.com",
      ownership: "hfy",
      email: "private@example.com",
      phone: "555-0100",
      outstandingOwedCents: 100_000,
      totalEarningsCents: 900_000,
      achRoutingNumberEncrypted: "secret",
      achAccountNumberEncrypted: "secret",
      w9StoragePath: "private.pdf",
      talentNotes: "internal",
      exclusiveResidencyId: "b8635dba-1e2b-4779-a4ff-1c7ab404e6a8",
    });
    expect(result).toEqual({
      id: "4fba74ec-d8d4-46d1-aecc-b560e12dca44",
      stageName: "Safe Artist",
      homeMarket: "Palm Springs",
      genres: ["House"],
      instagramHandle: "@safeartist",
      clientContact: "",
      ownership: "hfy",
    });
    expect(Object.keys(result).sort()).toEqual(["clientContact", "genres", "homeMarket", "id", "instagramHandle", "ownership", "stageName"].sort());
  });

  it("shows the simple client-entered contact only for a client-owned artist", () => {
    expect(projectClientSafeTalent({
      id: "4fba74ec-d8d4-46d1-aecc-b560e12dca44",
      stageName: "Client Artist",
      homeMarket: "",
      genres: ["Open Format"],
      instagramHandle: "",
      clientContact: "dj@example.com · 555-0100",
      ownership: "residency",
    }).clientContact).toBe("dj@example.com · 555-0100");
  });
});
