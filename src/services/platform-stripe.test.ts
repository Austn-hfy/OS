import { beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, platformSubscriptionRevisions, platformSubscriptions } from "@/db/schema";
import type { InternalActor } from "@/lib/auth";

const databaseMock = vi.hoisted(() => ({ getDb: vi.fn() }));

vi.mock("@/db/client", () => ({ getDb: databaseMock.getDb }));
vi.mock("@/lib/platform-billing-stage", () => ({ assertCurrentPlatformBillingStaging: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn(), stagingBillingReturnUrl: vi.fn() }));
vi.mock("@/services/live-billing-safety", () => ({ requireResidencyLiveBillingApproval: vi.fn() }));

import { updateCommittedPlan, type CommittedPlanInput } from "./platform-stripe";

const residencyId = "00000000-0000-4000-8000-000000000001";
const subscriptionId = "00000000-0000-4000-8000-000000000002";
const actor: InternalActor = {
  kind: "internal",
  userId: "00000000-0000-4000-8000-000000000003",
  email: "owner@example.test",
  displayName: "Owner",
};

const input: CommittedPlanInput = {
  residencyId,
  cadence: "monthly",
  talentProgramSessions: 8,
  talentSessionUnitAmountCents: 6_000,
  housePrograms: 3,
  houseProgramUnitAmountCents: 5_000,
  oneOffAllowance: 0,
  startsOn: "2026-09-01",
  renewsOn: "2026-10-01",
  changeReason: "Distinct founding rates",
};

beforeEach(() => {
  databaseMock.getDb.mockReset();
});

describe("Committed Plan persistence", () => {
  it("persists distinct Talent and House rates in both the plan and its revision without writing the legacy blended rate", async () => {
    const inserted: Array<{ table: unknown; values: Record<string, unknown> }> = [];
    const selectResults = [[{ id: residencyId }], []];
    const tx = {
      insert(table: unknown) {
        return {
          values(values: Record<string, unknown>) {
            inserted.push({ table, values });
            return {
              returning: async () => table === platformSubscriptions
                ? [{ id: subscriptionId, ...values }]
                : [],
            };
          },
        };
      },
    };
    const database = {
      select() {
        return {
          from() {
            return {
              where() {
                return { limit: async () => selectResults.shift() ?? [] };
              },
            };
          },
        };
      },
      transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    };
    databaseMock.getDb.mockReturnValue(database);

    await updateCommittedPlan(actor, input);

    const plan = inserted.find((entry) => entry.table === platformSubscriptions)?.values;
    const revision = inserted.find((entry) => entry.table === platformSubscriptionRevisions)?.values;
    const audit = inserted.find((entry) => entry.table === auditLog)?.values;

    expect(plan).toMatchObject({
      talentProgramSessions: 8,
      talentSessionUnitAmountCents: 6_000,
      housePrograms: 3,
      houseProgramUnitAmountCents: 5_000,
    });
    expect(plan).not.toHaveProperty("unitAmountCents");
    expect(revision).toMatchObject({
      revision: 1,
      talentProgramSessions: 8,
      talentSessionUnitAmountCents: 6_000,
      housePrograms: 3,
      houseProgramUnitAmountCents: 5_000,
    });
    expect(revision).not.toHaveProperty("unitAmountCents");
    expect(audit).toBeDefined();
  });
});
