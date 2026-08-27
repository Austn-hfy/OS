import { describe, expect, it } from "vitest";
import { parseAirtableTalentExport, parseAirtableTalentRecord } from "./airtable-talent";

describe("Airtable Talent import mapping", () => {
  it("preserves identity, statuses, payment details, and financial rollups", () => {
    const record = parseAirtableTalentRecord({
      id: "recTalent1",
      fields: {
        "Stage Name": "DJ Example",
        "Full Name": "Example Artist",
        Email: "artist@example.com",
        Phone: "760-555-0123",
        "Instagram Handle": "@example",
        "Roster Status": { id: "selReady", name: "Ready" },
        "Talent Status": { id: "selInactive", name: "Inactive" },
        "Home Market": { id: "selPalm", name: "Palm Springs" },
        Genres: [{ id: "selHouse", name: "House" }, { id: "selDisco", name: "Disco" }],
        Priority: 5,
        "Talent Notes": "Internal note",
        "Payment Method": { id: "selAch", name: "ACH" },
        "ACH Account Name": "Example Artist",
        "ACH Routing Number": "123456789",
        "ACH Account Number": "0000123456",
        "Total Outstanding Owed": 240,
        "Total Earnings (All Time)": "$1,200.50",
        "Owed From": ["Ace · Aug 22 · $240"],
        "Upcoming Bookings": ["Sep 4 · Pool"],
      },
    });
    expect(record).toMatchObject({
      stageName: "DJ Example",
      rosterStatus: "ready",
      talentStatus: "inactive",
      homeMarket: "Palm Springs",
      genres: ["House", "Disco"],
      legacyOutstandingOwedCents: 24_000,
      legacyTotalEarningsCents: 120_050,
      legacyOwedFrom: "Ace · Aug 22 · $240",
      payment: { paymentMethod: "ACH", lastFour: "3456" },
    });
  });

  it("rejects duplicate Airtable IDs", () => {
    const record = { id: "recDuplicate", fields: { "Stage Name": "Duplicate" } };
    expect(() => parseAirtableTalentExport([record, record])).toThrow("Duplicate Airtable record ID");
  });
});
