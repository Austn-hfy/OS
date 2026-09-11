import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireResidencyActor } from "@/lib/auth";
import { createPlatformPaymentMethodCheckout, createPlatformSubscriptionCheckout } from "@/services/platform-stripe";
import { startResidencyPlatformCheckoutAction, updateResidencyPlatformCardAction } from "./actions";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireResidencyActor: vi.fn() }));
vi.mock("@/services/platform-stripe", () => ({
  createPlatformPaymentMethodCheckout: vi.fn(),
  createPlatformSubscriptionCheckout: vi.fn(),
}));

const initialState = { status: "idle" as const, message: "" };
const productionHold = new Error("Platform billing is staging-only and is disabled in the production deployment.");

describe("Residency billing action hold responses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireResidencyActor).mockResolvedValue({
      kind: "residency",
      userId: "00000000-0000-4000-8000-000000000001",
      email: "manager@example.test",
      residencyId: "00000000-0000-4000-8000-000000000002",
      accessRole: "manager",
    } as never);
  });

  it("returns a clean message when checkout is held", async () => {
    vi.mocked(createPlatformSubscriptionCheckout).mockRejectedValue(productionHold);

    await expect(startResidencyPlatformCheckoutAction(initialState, new FormData())).resolves.toEqual({
      status: "error",
      message: productionHold.message,
    });
  });

  it("returns a clean message when card updates are held", async () => {
    vi.mocked(createPlatformPaymentMethodCheckout).mockRejectedValue(productionHold);

    await expect(updateResidencyPlatformCardAction(initialState, new FormData())).resolves.toEqual({
      status: "error",
      message: productionHold.message,
    });
  });
});
