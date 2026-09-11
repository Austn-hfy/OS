import { describe, expect, it } from "vitest";
import { buildShiftChangeRequestResolvedEmail, buildShiftChangeRequestSubmittedEmail } from "./shift-change-request-email";

const request = {
  requestId: "00000000-0000-4000-8000-000000000001",
  requestType: "change_time" as const,
  residencyName: "Sunset House",
  shiftName: "Poolside Session",
  room: "Pool",
  serviceDate: "2026-09-12",
  managerNote: "The private event starts later.",
};

describe("Shift change request email", () => {
  it("builds the owner submission notice with queue context and proposed hours", () => {
    const email = buildShiftChangeRequestSubmittedEmail({
      ...request,
      requestedByName: "Residency Manager",
      proposedStartAt: new Date("2026-09-13T05:00:00.000Z"),
      proposedEndAt: new Date("2026-09-13T09:00:00.000Z"),
      residencyTimezone: "America/Los_Angeles",
      queueUrl: "https://hfy.app/app?mode=hfy#shift-change-requests",
    });

    expect(email.subject).toContain("Sunset House");
    expect(email.html).toContain("Change time");
    expect(email.html).toContain("10:00 PM–2:00 AM");
    expect(email.html).toContain("The private event starts later.");
    expect(email.html).toContain("Open the HFY request queue");
  });

  it("builds an approval outcome with the owner's note", () => {
    const email = buildShiftChangeRequestResolvedEmail({
      ...request,
      decision: "approved",
      resolutionNote: "Updated around the confirmed event timeline.",
    });

    expect(email.subject).toContain("approved");
    expect(email.html).toContain("Updated around the confirmed event timeline.");
    expect(email.html).toContain("has been applied");
  });

  it("explains that a denial leaves the Shift unchanged and escapes notes", () => {
    const email = buildShiftChangeRequestResolvedEmail({
      ...request,
      decision: "denied",
      resolutionNote: "Already confirmed with <Artist>.",
    });

    expect(email.subject).toContain("denied");
    expect(email.html).toContain("Already confirmed with &lt;Artist&gt;.");
    expect(email.html).toContain("No changes were made");
  });
});
