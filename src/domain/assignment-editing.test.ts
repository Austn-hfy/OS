import { describe, expect, it } from "vitest";
import { assignmentHoursDraftFromAssignment, canEditClientManagedAssignmentHours, replacementDraftFromAssignment } from "./assignment-editing";

describe("assignment replacement editing", () => {
  it("starts a replacement with the current DJ's exact hours", () => {
    expect(replacementDraftFromAssignment({
      id: "assignment-1",
      startClock: "12:00",
      endClock: "19:00",
    })).toEqual({
      assignmentId: "assignment-1",
      talentId: "",
      start: "12:00",
      end: "19:00",
    });
  });
});

describe("Client Managed assignment hours editing", () => {
  it("keeps the booked artist while starting from their current hours", () => {
    expect(assignmentHoursDraftFromAssignment({
      id: "assignment-1",
      talentId: "artist-1",
      startClock: "12:00",
      endClock: "19:00",
    })).toEqual({
      assignmentId: "assignment-1",
      talentId: "artist-1",
      start: "12:00",
      end: "19:00",
    });
  });

  it("is available only to managers editing Client Managed Talent Shifts", () => {
    const clientManagedTalentShift = {
      canManage: true,
      previewMode: true,
      recordType: "financial_shift" as const,
      daypartType: "dj_artist" as const,
      economicsMode: "client_owned" as const,
    };

    expect(canEditClientManagedAssignmentHours(clientManagedTalentShift)).toBe(true);
    expect(canEditClientManagedAssignmentHours({ ...clientManagedTalentShift, canManage: false })).toBe(false);
    expect(canEditClientManagedAssignmentHours({ ...clientManagedTalentShift, previewMode: false })).toBe(false);
    expect(canEditClientManagedAssignmentHours({ ...clientManagedTalentShift, economicsMode: "hfy" })).toBe(false);
    expect(canEditClientManagedAssignmentHours({ ...clientManagedTalentShift, daypartType: "house_activity" })).toBe(false);
    expect(canEditClientManagedAssignmentHours({ ...clientManagedTalentShift, recordType: "nonfinancial_occurrence" })).toBe(false);
  });
});
