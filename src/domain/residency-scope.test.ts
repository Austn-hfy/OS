import { describe, expect, it } from "vitest";
import { assertResidencyScope } from "./residency-scope";

describe("multi-residency isolation", () => {
  it("allows a hotel to act inside its assigned Residency", () => {
    expect(() => assertResidencyScope("residency-a", "residency-a")).not.toThrow();
  });

  it("rejects access to another Residency", () => {
    expect(() => assertResidencyScope("residency-a", "residency-b")).toThrow(/outside your Residency/);
  });
});
