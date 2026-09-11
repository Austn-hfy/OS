import { beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, platformSubscriptionRevisions, platformSubscriptions, residencies } from "@/db/schema";
import type { InternalActor } from "@/lib/auth";

const databaseMock = vi.hoisted(() => ({ getDb: vi.fn() }));

vi.mock("@/db/client", () => ({ getDb: databaseMock.getDb }));
vi.mock("@/lib/platform-billing-stage", () => ({ assertCurrentPlatformBillingStaging: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn(), stagingBillingReturnUrl: vi.fn() }));
vi.mock("@/services/live-billing-safety", () => ({ requireResidencyLiveBillingApproval: vi.fn() }));

import {
  enrollFoundingClient,
  platformPlanAmount,
  updateCommittedPlan,
  updateResidencyCompedStatus,
  type CommittedPlanInput,
} from "./platform-stripe";

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
  commitmentTier: null,
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
  it("calculates a $0 effective Stripe amount for a comped plan without mutating its stored rates", () => {
    const storedPlan = { ...input, commitmentTier: "six_month" as const };

    expect(platformPlanAmount(storedPlan, true)).toEqual({ monthlyAmountCents: 0, cadenceAmountCents: 0 });
    expect(storedPlan).toMatchObject({
      commitmentTier: "six_month",
      talentSessionUnitAmountCents: 6_000,
      houseProgramUnitAmountCents: 5_000,
    });
  });

  it("requires the exact typed phrase before changing comped status", async () => {
    const database = {
      select() {
        return {
          from() {
            return {
              where() {
                return { limit: async () => [{ id: residencyId, name: "Ace Hotel", comped: false }] };
              },
            };
          },
        };
      },
    };
    databaseMock.getDb.mockReturnValue(database);

    await expect(updateResidencyCompedStatus(actor, {
      residencyId,
      comped: true,
      confirmation: "COMP ACE",
    })).rejects.toThrow(/SET Ace Hotel AS PERMANENTLY COMPED/);
  });

  it("persists distinct Talent and House rates in both the plan and its revision without writing the legacy blended rate", async () => {
    const inserted: Array<{ table: unknown; values: Record<string, unknown> }> = [];
    const selectResults = [[{ id: residencyId, foundingClientSignedAt: null, foundingClientEndsAt: null }], []];
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

  it("persists a post-Founding tier start and length while enforcing its rates", async () => {
    const now = new Date("2027-08-15T12:00:00.000Z");
    const inserted: Array<{ table: unknown; values: Record<string, unknown> }> = [];
    const selectResults = [[{
      id: residencyId,
      foundingClientSignedAt: new Date("2027-01-01T00:00:00.000Z"),
      foundingClientEndsAt: new Date("2027-07-01T00:00:00.000Z"),
    }], []];
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

    await updateCommittedPlan(actor, {
      ...input,
      cadence: "annual",
      commitmentTier: "six_month",
      talentSessionUnitAmountCents: 1,
      houseProgramUnitAmountCents: 1,
    }, { now });

    for (const values of [
      inserted.find((entry) => entry.table === platformSubscriptions)?.values,
      inserted.find((entry) => entry.table === platformSubscriptionRevisions)?.values,
    ]) {
      expect(values).toMatchObject({
        cadence: "monthly",
        commitmentTier: "six_month",
        commitmentStartedAt: now,
        commitmentLengthMonths: 6,
        talentSessionUnitAmountCents: 7_000,
        houseProgramUnitAmountCents: 6_000,
      });
    }
  });

  it("atomically enrolls an eligible Residency and forces both plan rates to $60", async () => {
    const now = new Date("2027-07-31T12:00:00.000Z");
    const inserted: Array<{ table: unknown; values: Record<string, unknown> }> = [];
    const updated: Array<{ table: unknown; values: Record<string, unknown> }> = [];
    const selectResults = [[{ id: residencyId, foundingClientSignedAt: null, foundingClientEndsAt: null }], []];
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
      update(table: unknown) {
        return {
          set(values: Record<string, unknown>) {
            updated.push({ table, values });
            return { where: () => ({ returning: async () => [{ id: residencyId }] }) };
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

    await updateCommittedPlan(actor, {
      ...input,
      cadence: "annual",
      talentSessionUnitAmountCents: 9_000,
      houseProgramUnitAmountCents: 5_000,
    }, { now, enrollFoundingClient: true });

    expect(inserted.find((entry) => entry.table === platformSubscriptions)?.values).toMatchObject({
      cadence: "monthly",
      talentSessionUnitAmountCents: 6_000,
      houseProgramUnitAmountCents: 6_000,
    });
    expect(inserted.find((entry) => entry.table === platformSubscriptionRevisions)?.values).toMatchObject({
      cadence: "monthly",
      talentSessionUnitAmountCents: 6_000,
      houseProgramUnitAmountCents: 6_000,
    });
    expect(updated.find((entry) => entry.table === residencies)?.values).toMatchObject({
      foundingClientSignedAt: now,
      foundingClientEndsAt: new Date("2028-01-31T12:00:00.000Z"),
    });
  });

  it("overrides a forged non-$60 Committed Plan save during an active Founding window", async () => {
    const now = new Date("2027-03-01T12:00:00.000Z");
    const inserted: Array<{ table: unknown; values: Record<string, unknown> }> = [];
    const selectResults = [[{
      id: residencyId,
      foundingClientSignedAt: new Date("2027-01-01T12:00:00.000Z"),
      foundingClientEndsAt: new Date("2027-07-01T12:00:00.000Z"),
    }], []];
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

    await updateCommittedPlan(actor, {
      ...input,
      cadence: "quarterly",
      talentSessionUnitAmountCents: 1,
      houseProgramUnitAmountCents: 999_999,
    }, { now });

    expect(inserted.find((entry) => entry.table === platformSubscriptions)?.values).toMatchObject({
      cadence: "monthly",
      talentSessionUnitAmountCents: 6_000,
      houseProgramUnitAmountCents: 6_000,
    });
    expect(inserted.find((entry) => entry.table === platformSubscriptionRevisions)?.values).toMatchObject({
      cadence: "monthly",
      talentSessionUnitAmountCents: 6_000,
      houseProgramUnitAmountCents: 6_000,
    });
  });

  it("does not persist forged rates when a comped Residency creates its first underlying plan", async () => {
    const inserted: Array<{ table: unknown; values: Record<string, unknown> }> = [];
    const selectResults = [[{
      id: residencyId,
      comped: true,
      foundingClientSignedAt: new Date("2027-01-01T00:00:00.000Z"),
      foundingClientEndsAt: new Date("2027-07-01T00:00:00.000Z"),
    }], []];
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

    await updateCommittedPlan(actor, {
      ...input,
      cadence: "annual",
      talentSessionUnitAmountCents: 999_999,
      houseProgramUnitAmountCents: 888_888,
    }, { now: new Date("2028-01-01T00:00:00.000Z") });

    for (const values of [
      inserted.find((entry) => entry.table === platformSubscriptions)?.values,
      inserted.find((entry) => entry.table === platformSubscriptionRevisions)?.values,
    ]) {
      expect(values).toMatchObject({
        cadence: "annual",
        commitmentTier: null,
        commitmentStartedAt: null,
        commitmentLengthMonths: null,
        talentSessionUnitAmountCents: 6_000,
        houseProgramUnitAmountCents: 6_000,
      });
    }
  });

  it("preserves the exact stored rate, tier, and term when comp is enabled and disabled", async () => {
    const commitmentStartedAt = new Date("2027-08-15T12:00:00.000Z");
    const current = {
      id: subscriptionId,
      residencyId,
      cadence: "monthly" as const,
      commitmentTier: "six_month" as const,
      commitmentStartedAt,
      commitmentLengthMonths: 6,
      revision: 7,
      talentProgramSessions: 8,
      talentSessionUnitAmountCents: 7_000,
      housePrograms: 3,
      houseProgramUnitAmountCents: 6_000,
      oneOffAllowance: 2,
      startsOn: "2027-08-15",
      renewsOn: "2027-09-15",
      stripeSubscriptionId: null,
      stripeSubscriptionItemId: null,
      stripePriceId: null,
      status: "active" as const,
      nextChargeAt: null,
      lastStripeSyncedAt: null,
    };

    const runToggle = async (comped: boolean, nextComped: boolean) => {
      const inserted: Array<{ table: unknown; values: Record<string, unknown> }> = [];
      const updated: Array<{ table: unknown; values: Record<string, unknown> }> = [];
      const residency = {
        id: residencyId,
        name: "HFY Internal Test Residency",
        comped,
        foundingClientSignedAt: null,
        foundingClientEndsAt: null,
      };
      const selectResults = [[residency], [current], [residency], [current]];
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
        insert(table: unknown) {
          return {
            values(values: Record<string, unknown>) {
              inserted.push({ table, values });
              return { returning: async () => [{ id: "00000000-0000-4000-8000-000000000004" }] };
            },
          };
        },
        update(table: unknown) {
          return {
            set(values: Record<string, unknown>) {
              updated.push({ table, values });
              return {
                where() {
                  return {
                    returning: async () => table === platformSubscriptions
                      ? [{ ...current, ...values }]
                      : [{ id: residencyId }],
                  };
                },
              };
            },
          };
        },
        transaction(callback: (transaction: unknown) => Promise<unknown>) {
          return callback(this);
        },
      };
      databaseMock.getDb.mockReturnValue(database);

      await updateResidencyCompedStatus(actor, {
        residencyId,
        comped: nextComped,
        confirmation: nextComped
          ? "SET HFY Internal Test Residency AS PERMANENTLY COMPED"
          : "REMOVE PERMANENT COMP FROM HFY Internal Test Residency",
      });

      const expectedStoredState = {
        commitmentTier: "six_month",
        commitmentStartedAt,
        commitmentLengthMonths: 6,
        talentSessionUnitAmountCents: 7_000,
        houseProgramUnitAmountCents: 6_000,
      };
      expect(updated.find((entry) => entry.table === platformSubscriptions)?.values).toMatchObject(expectedStoredState);
      expect(inserted.find((entry) => entry.table === platformSubscriptionRevisions)?.values).toMatchObject(expectedStoredState);
      expect(updated.find((entry) => entry.table === residencies)?.values).toMatchObject({ comped: nextComped });
    };

    await runToggle(false, true);
    await runToggle(true, false);
  });

  it("rejects a submitted commitment tier for a comped Residency", async () => {
    const selectResults = [[{
      id: residencyId,
      comped: true,
      foundingClientSignedAt: null,
      foundingClientEndsAt: null,
    }], []];
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
    };
    databaseMock.getDb.mockReturnValue(database);

    await expect(updateCommittedPlan(actor, {
      ...input,
      commitmentTier: "twelve_month",
    })).rejects.toThrow(/does not use commitment tiers/);
  });

  it("rejects commitment-tier selection while the Residency is still inside its Founding window", async () => {
    const selectResults = [[{
      id: residencyId,
      foundingClientSignedAt: new Date("2027-01-01T00:00:00.000Z"),
      foundingClientEndsAt: new Date("2027-07-01T00:00:00.000Z"),
    }], []];
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
    };
    databaseMock.getDb.mockReturnValue(database);

    await expect(updateCommittedPlan(actor, {
      ...input,
      commitmentTier: "twelve_month",
    }, { now: new Date("2027-04-01T00:00:00.000Z") })).rejects.toThrow(/cannot select/);
  });

  it("explicitly enrolls an eligible Residency that does not have a Committed Plan yet", async () => {
    const now = new Date("2027-04-10T09:15:00.000Z");
    const updates: Array<Record<string, unknown>> = [];
    const audits: Array<Record<string, unknown>> = [];
    const selectResults = [[{ id: residencyId, foundingClientSignedAt: null, foundingClientEndsAt: null }], []];
    const tx = {
      update() {
        return {
          set(values: Record<string, unknown>) {
            updates.push(values);
            return { where: () => ({ returning: async () => [{ id: residencyId }] }) };
          },
        };
      },
      insert() {
        return { values: (values: Record<string, unknown>) => { audits.push(values); } };
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

    const window = await enrollFoundingClient(actor, residencyId, { now });

    expect(window).toEqual({ signedAt: now, endsAt: new Date("2027-10-10T09:15:00.000Z") });
    expect(updates[0]).toMatchObject({ foundingClientSignedAt: now, foundingClientEndsAt: window.endsAt });
    expect(audits[0]).toMatchObject({ action: "residency_founding_client_enrolled", entityId: residencyId });
  });

  it("rejects Founding Client enrollment at the cutoff before reading or changing data", async () => {
    await expect(enrollFoundingClient(actor, residencyId, { now: new Date("2027-08-01T00:00:00.000Z") }))
      .rejects.toThrow(/closed/);
    expect(databaseMock.getDb).not.toHaveBeenCalled();
  });

  it("rejects Founding Client enrollment for a comped Residency", async () => {
    const selectResults = [[{
      id: residencyId,
      comped: true,
      foundingClientSignedAt: null,
      foundingClientEndsAt: null,
    }]];
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
    };
    databaseMock.getDb.mockReturnValue(database);

    await expect(enrollFoundingClient(actor, residencyId, { now: new Date("2027-04-01T00:00:00.000Z") }))
      .rejects.toThrow(/cannot enroll/);
  });
});
