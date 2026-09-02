import { describe, expect, it } from "vitest";
import {
  MISSING_RESIDENCY_CLIENT_RATE_MESSAGE,
  MISSING_RESIDENCY_TALENT_RATE_MESSAGE,
  assertResidencyClientRateConfigured,
  assertResidencyTalentRateConfigured,
} from "@/domain/residency-rates";

describe("Residency talent-rate assignment guard", () => {
  it("blocks unset and zero defaults", () => {
    expect(() => assertResidencyTalentRateConfigured(0)).toThrow(MISSING_RESIDENCY_TALENT_RATE_MESSAGE);
    expect(() => assertResidencyTalentRateConfigured(-1)).toThrow(MISSING_RESIDENCY_TALENT_RATE_MESSAGE);
  });

  it("allows a positive configured default", () => {
    expect(() => assertResidencyTalentRateConfigured(7_500)).not.toThrow();
  });

  it("requires a positive Residency client rate for HFY request fulfillment", () => {
    expect(() => assertResidencyClientRateConfigured(0)).toThrow(MISSING_RESIDENCY_CLIENT_RATE_MESSAGE);
    expect(() => assertResidencyClientRateConfigured(-1)).toThrow(MISSING_RESIDENCY_CLIENT_RATE_MESSAGE);
    expect(() => assertResidencyClientRateConfigured(10_000)).not.toThrow();
  });
});
