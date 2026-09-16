import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { requireResidencyActor } from "@/lib/auth";
import { createPlatformPaymentMethodCheckout, createPlatformSubscriptionCheckout, switchResidencyCommittedPlanToAnnual } from "@/services/platform-stripe";
import { startResidencyPlatformCheckoutAction, switchResidencyPlatformPlanToAnnualAction, updateResidencyPlatformCardAction } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireResidencyActor: vi.fn() }));
vi.mock("@/services/platform-stripe", () => ({
  createPlatformPaymentMethodCheckout: vi.fn(),
  createPlatformSubscriptionCheckout: vi.fn(),
  switchResidencyCommittedPlanToAnnual: vi.fn(),
}));

const initialState = { status: "idle" as const, message: "" };
const environmentHold = new Error("Platform billing can run only in production or the stable staging deployment.");

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
    vi.mocked(createPlatformSubscriptionCheckout).mockRejectedValue(environmentHold);

    await expect(startResidencyPlatformCheckoutAction(initialState, new FormData())).resolves.toEqual({
      status: "error",
      message: environmentHold.message,
    });
  });

  it("returns a clean message when card updates are held", async () => {
    vi.mocked(createPlatformPaymentMethodCheckout).mockRejectedValue(environmentHold);

    await expect(updateResidencyPlatformCardAction(initialState, new FormData())).resolves.toEqual({
      status: "error",
      message: environmentHold.message,
    });
  });

  it("lets a manager schedule annual billing through the existing plan-change service", async () => {
    await expect(switchResidencyPlatformPlanToAnnualAction(initialState, new FormData())).resolves.toEqual({
      status: "success",
      message: "Annual billing is scheduled for your next renewal.",
    });

    expect(switchResidencyCommittedPlanToAnnual).toHaveBeenCalledWith(expect.objectContaining({
      kind: "residency",
      residencyId: "00000000-0000-4000-8000-000000000002",
      accessRole: "manager",
    }));
    expect(revalidatePath).toHaveBeenCalledWith("/residency/settings/billing");
    expect(revalidatePath).toHaveBeenCalledWith("/app/platform-billing");
  });

  it("does not let a non-manager switch the billing term", async () => {
    vi.mocked(requireResidencyActor).mockResolvedValue({ accessRole: "calendar_viewer" } as never);

    await expect(switchResidencyPlatformPlanToAnnualAction(initialState, new FormData())).resolves.toEqual({
      status: "error",
      message: "Manager access is required.",
    });
    expect(switchResidencyCommittedPlanToAnnual).not.toHaveBeenCalled();
  });
});
