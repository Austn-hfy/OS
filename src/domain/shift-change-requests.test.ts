import { describe, expect, it } from "vitest";
import { zonedLocalDateTimeToUtc } from "./time";
import { prepareShiftChangeRequest } from "./shift-change-requests";

const shift = { serviceDate: "2026-09-12", timezone: "America/Los_Angeles" };

function local(value: string) {
  return zonedLocalDateTimeToUtc(value, shift.timezone);
}

describe("Shift change requests", () => {
  it("accepts and trims a cancellation request without proposed hours", () => {
    expect(prepareShiftChangeRequest({
      requestType: "cancel_occurrence",
      managerNote: "  Private event took over the room.  ",
      proposedStartAt: null,
      proposedEndAt: null,
    }, shift)).toMatchObject({
      managerNote: "Private event took over the room.",
      proposedStartAt: null,
      proposedEndAt: null,
    });
  });

  it("requires a manager note", () => {
    expect(() => prepareShiftChangeRequest({
      requestType: "delete_permanent",
      managerNote: "   ",
      proposedStartAt: null,
      proposedEndAt: null,
    }, shift)).toThrow("Tell HFY why");
  });

  it("requires both proposed times for a Change time request", () => {
    expect(() => prepareShiftChangeRequest({
      requestType: "change_time",
      managerNote: "The event starts later.",
      proposedStartAt: local("2026-09-12T20:00"),
      proposedEndAt: null,
    }, shift)).toThrow("Choose proposed start and end times");
  });

  it("accepts an overnight proposed window for the Shift service date", () => {
    const request = prepareShiftChangeRequest({
      requestType: "change_time",
      managerNote: "Move the event later.",
      proposedStartAt: local("2026-09-12T22:00"),
      proposedEndAt: local("2026-09-13T02:00"),
    }, shift);

    expect(request.proposedEndAt?.getTime()).toBeGreaterThan(request.proposedStartAt?.getTime() ?? 0);
  });

  it("rejects a proposed window for a different service date", () => {
    expect(() => prepareShiftChangeRequest({
      requestType: "change_time",
      managerNote: "Wrong date.",
      proposedStartAt: local("2026-09-13T20:00"),
      proposedEndAt: local("2026-09-13T22:00"),
    }, shift)).toThrow("this Shift date");
  });

  it("rejects proposed hours on non-time requests", () => {
    expect(() => prepareShiftChangeRequest({
      requestType: "cancel_occurrence",
      managerNote: "Cancel it.",
      proposedStartAt: local("2026-09-12T20:00"),
      proposedEndAt: local("2026-09-12T22:00"),
    }, shift)).toThrow("only be included with a Change time request");
  });
});
