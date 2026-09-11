import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireInternalActor } from "@/lib/auth";
import { createPlatformSubscriptionCheckout } from "@/services/platform-stripe";
import { reconcilePlatformUsage } from "@/services/platform-usage";
import { refreshPlatformUsageAction, startPlatformStripeCheckoutAction } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireInternalActor: vi.fn(),
  requireInternalActorForMutation: vi.fn(),
}));
vi.mock("@/services/platform-stripe", () => ({
  createPlatformSubscriptionCheckout: vi.fn(),
  enrollFoundingClient: vi.fn(),
  updateCommittedPlan: vi.fn(),
}));
vi.mock("@/services/platform-usage", () => ({ reconcilePlatformUsage: vi.fn() }));

const initialState = { status: "idle" as const, message: "" };
const productionHold = new Error("Platform billing is staging-only and is disabled in the production deployment.");

describe("Platform billing action hold responses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireInternalActor).mockResolvedValue({
      kind: "internal",
      userId: "00000000-0000-4000-8000-000000000001",
      email: "owner@example.test",
    } as never);
  });

  it("returns a clean message when checkout is held", async () => {
    vi.mocked(createPlatformSubscriptionCheckout).mockRejectedValue(productionHold);
    const formData = new FormData();
    formData.set("residencyId", "00000000-0000-4000-8000-000000000002");

    await expect(startPlatformStripeCheckoutAction(initialState, formData)).resolves.toEqual({
      status: "error",
      message: productionHold.message,
    });
  });

  it("returns a clean message when usage refresh is held", async () => {
    vi.mocked(reconcilePlatformUsage).mockRejectedValue(productionHold);
    const formData = new FormData();
    formData.set("residencyId", "00000000-0000-4000-8000-000000000002");

    await expect(refreshPlatformUsageAction(initialState, formData)).resolves.toEqual({
      status: "error",
      message: productionHold.message,
    });
  });
});
