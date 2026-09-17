import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireResidencyActor } from "@/lib/auth";
import { beginResidencyAnnualSwitch, createPlatformPaymentMethodCheckout, createPlatformSubscriptionCheckout } from "@/services/platform-stripe";
import { startResidencyPlatformCheckoutAction, switchResidencyPlatformPlanToAnnualAction, updateResidencyPlatformCardAction } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireResidencyActor: vi.fn() }));
vi.mock("@/services/platform-stripe", () => ({
  createPlatformPaymentMethodCheckout: vi.fn(),
  createPlatformSubscriptionCheckout: vi.fn(),
  beginResidencyAnnualSwitch: vi.fn(),
}));

const initialState = { status: "idle" as const, message: "" };
const environmentHold = new Error("Platform billing can run only in production or the stable staging deployment.");

function confirmedAnnualSwitch() {
  const formData = new FormData();
  formData.set("confirmation", "switch_to_annual");
  return formData;
}

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
    vi.mocked(beginResidencyAnnualSwitch).mockResolvedValue({
      kind: "scheduled",
      effectiveAt: "2026-10-01",
      annualUpfrontAmountCents: 810_000,
    });

    await expect(switchResidencyPlatformPlanToAnnualAction(initialState, confirmedAnnualSwitch())).resolves.toEqual({
      status: "success",
      message: "Annual billing is scheduled. Your current monthly plan remains active until renewal.",
    });

    expect(beginResidencyAnnualSwitch).toHaveBeenCalledWith(expect.objectContaining({
      kind: "residency",
      residencyId: "00000000-0000-4000-8000-000000000002",
      accessRole: "manager",
    }));
    expect(revalidatePath).toHaveBeenCalledWith("/residency/settings/billing");
    expect(revalidatePath).toHaveBeenCalledWith("/app/platform-billing");
  });

  it("does not let a non-manager switch the billing term", async () => {
    vi.mocked(requireResidencyActor).mockResolvedValue({ accessRole: "calendar_viewer" } as never);

    await expect(switchResidencyPlatformPlanToAnnualAction(initialState, confirmedAnnualSwitch())).resolves.toEqual({
      status: "error",
      message: "Manager access is required.",
    });
    expect(beginResidencyAnnualSwitch).not.toHaveBeenCalled();
  });

  it("requires the explicit confirmation before calling the plan service", async () => {
    await expect(switchResidencyPlatformPlanToAnnualAction(initialState, new FormData())).resolves.toEqual({
      status: "error",
      message: "Review and confirm the annual plan before continuing.",
    });
    expect(beginResidencyAnnualSwitch).not.toHaveBeenCalled();
  });

  it("redirects the no-card branch into the existing Stripe Checkout", async () => {
    vi.mocked(beginResidencyAnnualSwitch).mockResolvedValue({
      kind: "checkout",
      url: "https://checkout.stripe.com/c/pay/cs_test",
      paymentPath: "collect_card_and_start_annual",
    });

    await switchResidencyPlatformPlanToAnnualAction(initialState, confirmedAnnualSwitch());

    expect(redirect).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test");
  });
});
