import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("calendar assignment workflow safeguards", () => {
  it("cancels an assignment without revalidating stale roster economics", async () => {
    const source = await readFile(new URL("../src/services/assignments.ts", import.meta.url), "utf8");

    expect(source).toContain('targetStatus === "cancelled"');
    expect(source).toMatch(/targetStatus === "cancelled"[\s\S]*?bookingStatus: targetStatus,[\s\S]*?updatedAt: new Date\(\),[\s\S]*?: \{[\s\S]*?totalCompensationCents,[\s\S]*?payoutStatus: payoutState/);
  });

  it("never exposes raw database queries in the calendar assignment actions", async () => {
    const source = await readFile(new URL("../src/app/app/actions.ts", import.meta.url), "utf8");

    expect(source).toContain('error.message.startsWith("Failed query:") ? fallback : error.message');
    expect(source).toContain('calendarAssignmentErrorMessage(error, "Unable to update this DJ. Refresh the page and try again.")');
    expect(source).toContain('calendarAssignmentErrorMessage(error, "Unable to remove this DJ. Refresh the page and try again.")');
  });

  it("normalizes legacy hotel assignments before HFY edits them", async () => {
    const source = await readFile(new URL("../src/services/assignments.ts", import.meta.url), "utf8");

    expect(source).toContain('source !== "hotel"');
    expect(source).toContain('economicsMode === "hfy_request" ? "hfy_request" : "internal"');
    expect(source).toContain('source: normalizedManagedSource(actor, current.source, current.economicsMode)');
  });
});
