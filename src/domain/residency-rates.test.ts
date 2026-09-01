import { describe, expect, it } from "vitest";
import { MISSING_RESIDENCY_TALENT_RATE_MESSAGE, assertResidencyTalentRateConfigured } from "@/domain/residency-rates";

describe("Residency talent-rate assignment guard", () => {
  it("blocks unset and zero defaults", () => {
    expect(() => assertResidencyTalentRateConfigured(0)).toThrow(MISSING_RESIDENCY_TALENT_RATE_MESSAGE);
    expect(() => assertResidencyTalentRateConfigured(-1)).toThrow(MISSING_RESIDENCY_TALENT_RATE_MESSAGE);
  });

  it("allows a positive configured default", () => {
    expect(() => assertResidencyTalentRateConfigured(7_500)).not.toThrow();
  });
});
