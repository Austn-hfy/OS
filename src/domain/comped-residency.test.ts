import { describe, expect, it } from "vitest";
import { effectiveCompedPlan } from "./comped-residency";

describe("effectiveCompedPlan", () => {
  it("overlays a zero slot rate while preserving the bucket plan", () => {
    const plan = { talentBucketSize: 20, houseBucketSize: 10, term: "annual" as const, slotUnitAmountCents: 3_000 };
    expect(effectiveCompedPlan(plan, true)).toEqual({ ...plan, slotUnitAmountCents: 0 });
    expect(effectiveCompedPlan(plan, false)).toBe(plan);
  });
});
