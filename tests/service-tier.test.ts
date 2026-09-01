import { describe, expect, it } from "vitest";
import { formatServiceTier, serviceTierLabels } from "@/domain/service-tier";

describe("service tier labels", () => {
  it("maps the legacy database values to the current business model", () => {
    expect(serviceTierLabels.operations_only).toBe("Platform");
    expect(serviceTierLabels.complete).toBe("Full Programming");
    expect(formatServiceTier("operations_only")).toBe("Platform");
    expect(formatServiceTier("complete")).toBe("Full Programming");
  });
});
