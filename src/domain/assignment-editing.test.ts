import { describe, expect, it } from "vitest";
import { replacementDraftFromAssignment } from "./assignment-editing";

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
