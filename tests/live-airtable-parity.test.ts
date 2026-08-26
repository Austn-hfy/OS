import { describe, expect, it } from "vitest";
import fixture from "./fixtures/airtable-ace-2026-08-21.json";
import {
  addDays,
  calculateBillableAmountCents,
  calculateCompensationCents,
  grossMarginCents,
  invoiceBalanceCents,
  invoiceVarianceCents,
  isPaymentEligible,
  marginPercentage,
} from "../src/domain/airtable-parity";

describe("read-only live Airtable comparison fixture", () => {
  it.each(fixture.assignments)("matches Assignment formula outputs for $recordId", (record) => {
    const startsAt = new Date("2026-08-01T00:00:00.000Z");
    const endsAt = new Date(startsAt.getTime() + record.hours * 3_600_000);
    expect(calculateCompensationCents({
      compensationType: record.compensationType as "hourly" | "fixed" | "na",
      startsAt,
      endsAt,
      talentRateCents: record.effectiveRateDollars * 100,
    })).toBe(record.totalCompensationDollars * 100);
    expect(isPaymentEligible({
      bookingStatus: record.bookingStatus,
      compensationType: record.compensationType as "hourly" | "fixed" | "na",
      hasTalent: true,
      hasServiceDate: true,
      totalCompensationCents: record.totalCompensationDollars * 100,
    })).toBe(record.paymentEligible);
  });

  it.each(fixture.shifts)("matches Shift formula outputs for $recordId", (record) => {
    const startsAt = new Date(record.startsAt);
    const endsAt = new Date(record.endsAt);
    expect((endsAt.getTime() - startsAt.getTime()) / 3_600_000).toBe(record.hours);
    expect(calculateBillableAmountCents(startsAt, endsAt, record.clientRateDollars * 100))
      .toBe(record.billableAmountDollars * 100);
  });

  it.each(fixture.invoices)("matches Invoice formula outputs for $recordId", (record) => {
    const totalCents = record.invoiceTotalDollars * 100;
    const calculatedCents = record.calculatedAmountDollars * 100;
    const talentCostCents = record.talentCostDollars * 100;
    expect(addDays(record.invoiceDate, record.paymentTermsDays)).toBe(record.dueDate);
    expect(invoiceBalanceCents(record.status, totalCents)).toBe(record.balanceDollars * 100);
    expect(invoiceVarianceCents(totalCents, calculatedCents)).toBe(record.varianceDollars * 100);
    expect(grossMarginCents(totalCents, talentCostCents)).toBe(record.grossMarginDollars * 100);
    expect(marginPercentage(totalCents, talentCostCents)).toBeCloseTo(record.marginFraction * 100);
  });
});
