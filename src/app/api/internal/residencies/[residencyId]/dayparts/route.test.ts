import { describe, expect, it } from "vitest";
import { ResidencyAccessError } from "@/lib/auth";
import { residencyAccessErrorResponse } from "./route";

describe("GET /api/internal/residencies/:residencyId/dayparts authorization", () => {
  it("maps an unauthenticated request to 401", async () => {
    const response = residencyAccessErrorResponse(new ResidencyAccessError(401, "Sign in to continue."));

    expect(response?.status).toBe(401);
    expect(response?.headers.get("cache-control")).toBe("private, no-store");
    expect(await response?.json()).toEqual({ error: "Unauthorized." });
  });

  it("maps a forbidden Residency request to 403", async () => {
    const response = residencyAccessErrorResponse(new ResidencyAccessError(403, "You do not have access to this Residency."));

    expect(response?.status).toBe(403);
    expect(response?.headers.get("cache-control")).toBe("private, no-store");
    expect(await response?.json()).toEqual({ error: "Forbidden." });
  });

  it("does not convert unexpected server failures into authorization responses", () => {
    expect(residencyAccessErrorResponse(new Error("database unavailable"))).toBeNull();
  });
});
