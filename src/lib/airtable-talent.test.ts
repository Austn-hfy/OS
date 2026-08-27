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
        "Payment Details": "ACH · ending 3456",
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
      airtableRosterStatusLabel: "Ready",
      airtableTalentStatusLabel: "Inactive",
      airtablePaymentDetails: "ACH · ending 3456",
      homeMarket: "Palm Springs",
      genres: ["House", "Disco"],
      legacyOutstandingOwedCents: 24_000,
      legacyTotalEarningsCents: 120_050,
      legacyOwedFrom: "Ace · Aug 22 · $240",
      payment: { paymentMethod: "ACH", lastFour: "3456" },
    });
  });

  it("maps the MCP field-ID response without losing select labels", () => {
    const record = parseAirtableTalentRecord({
      id: "recTalentMcp",
      cellValuesByFieldId: {
        fldz4UOnimTL7RrRK: "MCP Artist",
        fldHSum7WiFA5iGNg: { id: "selReady", name: "Ready to Use" },
        fldNGaG0gRxRONyGT: { id: "selActive", name: "Active" },
        fldDmKCdjFxpUDALy: [{ id: "selHouse", name: "House" }],
      },
    });
    expect(record).toMatchObject({
      stageName: "MCP Artist",
      rosterStatus: "ready",
      talentStatus: "active",
      airtableRosterStatusLabel: "Ready to Use",
      airtableTalentStatusLabel: "Active",
      genres: ["House"],
    });
  });

  it("rejects duplicate Airtable IDs", () => {
    const record = { id: "recDuplicate", fields: { "Stage Name": "Duplicate" } };
    expect(() => parseAirtableTalentExport([record, record])).toThrow("Duplicate Airtable record ID");
  });
});
