import "server-only";

import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  assignments,
  clientAssignmentTerms,
  invoices,
  scheduleOccurrences,
  scheduleOccurrenceTalent,
  shifts,
  talent,
} from "@/db/schema";
import { calculateBillableAmountCents } from "@/domain/airtable-parity";
import { calculateClientOwedCents, resolveClientHourlyRateCents } from "@/domain/client-rates";
import {
  daypartDateKey,
  formatCompactMinuteRange,
  projectDaypartSlots,
  scheduleOccurrenceScheduling,
  slotSchedulingStatus,
} from "@/domain/dayparts";
import { localDateKey } from "@/domain/time";
import { monthRange, shiftDateKey } from "@/lib/calendar";
import { getDaypartDateExceptionsForResidencies, getDaypartsForResidency } from "@/services/dayparts";

export type ResidencyOverviewServiceStatus = "scheduled" | "pending" | "open";

export type ResidencyClientOverview = {
  asOfDate: string;
  week: Array<{
    date: string;
    scheduledCount: number;
    pendingCount: number;
    openCount: number;
    services: Array<{
      id: string;
      calendarEventId: string;
      daypartId: string | null;
      name: string;
      room: string;
      timeLabel: string;
      talentNames: string[];
      status: ResidencyOverviewServiceStatus;
    }>;
  }>;
  attention: {
    openServiceCount: number;
    nextOpenService: { name: string; room: string; serviceDate: string } | null;
    pendingConfirmationCount: number;
    nextPendingConfirmation: { talentName: string; activityName: string; serviceDate: string } | null;
    overdueInvoiceCount: number;
    overdueInvoiceCents: number;
  };
  finances: {
    currentMonthCommitmentsCents: number;
    owedToResidencyTalentCents: number;
    outstandingHfyInvoicesCents: number;
    openInvoiceCount: number;
    overdueInvoiceCount: number;
  };
};

type ShiftCoverageRow = {
  startsAt: Date;
  endsAt: Date;
  economicsMode: "hfy" | "client_owned" | "hfy_request";
};

type AssignmentCoverageRow = {
  talentId: string | null;
  startsAt: Date;
  endsAt: Date;
  bookingStatus: "open" | "offered" | "pending_hfy_confirmation" | "confirmed" | "completed" | "cancelled";
};

function assignmentWindow(shift: ShiftCoverageRow, assignment: AssignmentCoverageRow) {
  return {
    startMinute: (assignment.startsAt.getTime() - shift.startsAt.getTime()) / 60_000,
    endMinute: (assignment.endsAt.getTime() - shift.startsAt.getTime()) / 60_000,
  };
}

function shiftCoverageStatus(shift: ShiftCoverageRow, shiftAssignments: AssignmentCoverageRow[]): ResidencyOverviewServiceStatus {
  const shiftMinutes = (shift.endsAt.getTime() - shift.startsAt.getTime()) / 60_000;
  const confirmed = shiftAssignments.filter((assignment) => (
    assignment.talentId && ["confirmed", "completed"].includes(assignment.bookingStatus)
  ));
  const pending = shiftAssignments.filter((assignment) => (
    assignment.talentId && ["offered", "pending_hfy_confirmation"].includes(assignment.bookingStatus)
  ));
  const confirmedStatus = slotSchedulingStatus(0, shiftMinutes, confirmed.map((assignment) => assignmentWindow(shift, assignment)));
  if (confirmedStatus === "filled") return "scheduled";
  const withPendingStatus = slotSchedulingStatus(0, shiftMinutes, [...confirmed, ...pending].map((assignment) => assignmentWindow(shift, assignment)));
  if (shift.economicsMode === "hfy_request" || withPendingStatus === "filled") return "pending";
  return "open";
}

function dueDate(invoiceDate: string, paymentTermsDays: number) {
  return shiftDateKey(invoiceDate, paymentTermsDays);
}

function timeRangeLabel(startsAt: Date, endsAt: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
  return `${formatter.format(startsAt)}–${formatter.format(endsAt)}`;
}

export async function getResidencyClientOverview(
  residencyId: string,
  timeZone: string,
  at = new Date(),
): Promise<ResidencyClientOverview> {
  const database = getDb();
  const today = localDateKey(at, timeZone);
  const weekRange = { from: today, to: shiftDateKey(today, 6) };
  const currentMonth = monthRange(today.slice(0, 7));

  const [
    shiftRows,
    weekAssignmentRows,
    occurrenceRows,
    weekOccurrenceTalentRows,
    daypartRows,
    dateExceptions,
    pendingConfirmationRows,
    directTalentRows,
    currentMonthHfyRows,
    invoiceRows,
  ] = await Promise.all([
    database.select({
      id: shifts.id,
      daypartId: shifts.daypartId,
      name: shifts.name,
      room: shifts.room,
      serviceDate: shifts.serviceDate,
      startsAt: shifts.startsAt,
      endsAt: shifts.endsAt,
      economicsMode: shifts.economicsMode,
    }).from(shifts).where(and(
      eq(shifts.residencyId, residencyId),
      gte(shifts.serviceDate, weekRange.from),
      lte(shifts.serviceDate, weekRange.to),
    )).orderBy(asc(shifts.startsAt)),
    database.select({
      shiftId: assignments.shiftId,
      talentId: assignments.talentId,
      talentName: talent.stageName,
      guestName: assignments.guestName,
      startsAt: assignments.startsAt,
      endsAt: assignments.endsAt,
      bookingStatus: assignments.bookingStatus,
    }).from(assignments)
      .innerJoin(shifts, eq(assignments.shiftId, shifts.id))
      .leftJoin(talent, eq(assignments.talentId, talent.id))
      .where(and(
        eq(shifts.residencyId, residencyId),
        gte(shifts.serviceDate, weekRange.from),
        lte(shifts.serviceDate, weekRange.to),
      )).orderBy(asc(assignments.startsAt)),
    database.select({
      id: scheduleOccurrences.id,
      daypartId: scheduleOccurrences.daypartId,
      name: scheduleOccurrences.name,
      room: scheduleOccurrences.room,
      type: scheduleOccurrences.type,
      serviceDate: scheduleOccurrences.serviceDate,
      startsAt: scheduleOccurrences.startsAt,
      endsAt: scheduleOccurrences.endsAt,
      manualHostName: scheduleOccurrences.manualHostName,
    }).from(scheduleOccurrences).where(and(
      eq(scheduleOccurrences.residencyId, residencyId),
      gte(scheduleOccurrences.serviceDate, weekRange.from),
      lte(scheduleOccurrences.serviceDate, weekRange.to),
    )).orderBy(asc(scheduleOccurrences.startsAt)),
    database.select({
      occurrenceId: scheduleOccurrenceTalent.occurrenceId,
      talentName: talent.stageName,
    }).from(scheduleOccurrenceTalent)
      .innerJoin(scheduleOccurrences, eq(scheduleOccurrenceTalent.occurrenceId, scheduleOccurrences.id))
      .innerJoin(talent, eq(scheduleOccurrenceTalent.talentId, talent.id))
      .where(and(
        eq(scheduleOccurrences.residencyId, residencyId),
        gte(scheduleOccurrences.serviceDate, weekRange.from),
        lte(scheduleOccurrences.serviceDate, weekRange.to),
      )),
    getDaypartsForResidency(residencyId),
    getDaypartDateExceptionsForResidencies([residencyId], weekRange),
    database.select({
      talentName: talent.stageName,
      activityName: shifts.name,
      serviceDate: shifts.serviceDate,
      startsAt: assignments.startsAt,
    }).from(assignments)
      .innerJoin(shifts, eq(assignments.shiftId, shifts.id))
      .innerJoin(talent, eq(assignments.talentId, talent.id))
      .where(and(
        eq(shifts.residencyId, residencyId),
        gte(shifts.serviceDate, today),
        inArray(assignments.bookingStatus, ["offered", "pending_hfy_confirmation"]),
      )).orderBy(asc(shifts.serviceDate), asc(assignments.startsAt)),
    database.select({
      serviceDate: shifts.serviceDate,
      startsAt: assignments.startsAt,
      endsAt: assignments.endsAt,
      defaultRateCents: clientAssignmentTerms.defaultRateCents,
      overrideRateCents: clientAssignmentTerms.rateCents,
    }).from(assignments)
      .innerJoin(shifts, eq(assignments.shiftId, shifts.id))
      .innerJoin(clientAssignmentTerms, eq(clientAssignmentTerms.assignmentId, assignments.id))
      .where(and(
        eq(shifts.residencyId, residencyId),
        eq(assignments.source, "client_owned"),
        inArray(assignments.bookingStatus, ["confirmed", "completed"]),
      )),
    database.select({
      startsAt: shifts.startsAt,
      endsAt: shifts.endsAt,
      clientRateCents: shifts.clientRateCents,
    }).from(shifts).where(and(
      eq(shifts.residencyId, residencyId),
      gte(shifts.serviceDate, currentMonth.from),
      lte(shifts.serviceDate, currentMonth.to),
      inArray(shifts.economicsMode, ["hfy", "hfy_request"]),
    )),
    database.select({
      status: invoices.status,
      invoiceDate: invoices.invoiceDate,
      paymentTermsDays: invoices.paymentTermsDays,
      totalCents: invoices.totalCents,
    }).from(invoices).where(and(
      eq(invoices.residencyId, residencyId),
      inArray(invoices.status, ["approved", "sent", "paid"]),
    )),
  ]);

  const existingDaypartDates = new Set([
    ...shiftRows.flatMap((shift) => shift.daypartId ? [daypartDateKey(shift.daypartId, shift.serviceDate)] : []),
    ...occurrenceRows.flatMap((occurrence) => occurrence.daypartId ? [daypartDateKey(occurrence.daypartId, occurrence.serviceDate)] : []),
  ]);
  const projectedRows = projectDaypartSlots(daypartRows, weekRange.from, weekRange.to, existingDaypartDates, dateExceptions);
  const services = [
    ...shiftRows.map((shift) => {
      const shiftAssignments = weekAssignmentRows.filter((assignment) => assignment.shiftId === shift.id);
      const talentNames = [...new Set(shiftAssignments
        .filter((assignment) => assignment.bookingStatus !== "cancelled")
        .map((assignment) => assignment.talentName || assignment.guestName)
        .filter(Boolean))];
      return {
        id: `shift:${shift.id}`,
        calendarEventId: shift.id,
        daypartId: shift.daypartId,
        name: shift.name,
        room: shift.room,
        timeLabel: timeRangeLabel(shift.startsAt, shift.endsAt, timeZone),
        talentNames,
        serviceDate: shift.serviceDate,
        sortAt: shift.startsAt.getTime(),
        status: shiftCoverageStatus(shift, shiftAssignments),
      };
    }),
    ...occurrenceRows.map((occurrence) => {
      const talentNames = weekOccurrenceTalentRows
        .filter((assignment) => assignment.occurrenceId === occurrence.id)
        .map((assignment) => assignment.talentName);
      return {
        id: `occurrence:${occurrence.id}`,
        calendarEventId: occurrence.id,
        daypartId: occurrence.daypartId,
        name: occurrence.name,
        room: occurrence.room,
        timeLabel: timeRangeLabel(occurrence.startsAt, occurrence.endsAt, timeZone),
        talentNames: talentNames.length ? talentNames : [occurrence.manualHostName].filter(Boolean),
        serviceDate: occurrence.serviceDate,
        sortAt: occurrence.startsAt.getTime(),
        status: scheduleOccurrenceScheduling(
          occurrence.type,
          talentNames.length > 0,
        ).schedulingStatus === "filled" ? "scheduled" as const : "open" as const,
      };
    }),
    ...projectedRows.map((slot) => ({
      id: slot.id,
      calendarEventId: slot.id,
      daypartId: slot.daypartId,
      name: slot.name,
      room: slot.room,
      timeLabel: formatCompactMinuteRange(slot.startMinute, slot.endMinute),
      talentNames: [] as string[],
      serviceDate: slot.date,
      sortAt: slot.startMinute,
      status: "open" as const,
    })),
  ].sort((left, right) => left.serviceDate.localeCompare(right.serviceDate) || left.sortAt - right.sortAt);

  const week = Array.from({ length: 7 }, (_, index) => {
    const date = shiftDateKey(today, index);
    const dayServices = services.filter((service) => service.serviceDate === date);
    return {
      date,
      scheduledCount: dayServices.filter((service) => service.status === "scheduled").length,
      pendingCount: dayServices.filter((service) => service.status === "pending").length,
      openCount: dayServices.filter((service) => service.status === "open").length,
      services: dayServices.map(({ id, calendarEventId, daypartId, name, room, timeLabel, talentNames, status }) => ({
        id,
        calendarEventId,
        daypartId,
        name,
        room,
        timeLabel,
        talentNames,
        status,
      })),
    };
  });

  const directTalentAmounts = directTalentRows.map((row) => ({
    serviceDate: row.serviceDate,
    amountCents: calculateClientOwedCents(
      row.startsAt,
      row.endsAt,
      resolveClientHourlyRateCents(row.defaultRateCents, row.overrideRateCents),
    ) ?? 0,
  }));
  const currentMonthDirectCents = directTalentAmounts
    .filter((row) => row.serviceDate >= currentMonth.from && row.serviceDate <= currentMonth.to)
    .reduce((sum, row) => sum + row.amountCents, 0);
  const currentMonthHfyCents = currentMonthHfyRows.reduce(
    (sum, row) => sum + calculateBillableAmountCents(row.startsAt, row.endsAt, row.clientRateCents),
    0,
  );
  const openInvoices = invoiceRows.filter((invoice) => invoice.status !== "paid");
  const overdueInvoices = invoiceRows.filter((invoice) => (
    invoice.status === "sent" && dueDate(invoice.invoiceDate, invoice.paymentTermsDays) < today
  ));
  const openServices = services.filter((service) => service.status === "open");

  return {
    asOfDate: today,
    week,
    attention: {
      openServiceCount: openServices.length,
      nextOpenService: openServices[0] ? {
        name: openServices[0].name,
        room: openServices[0].room,
        serviceDate: openServices[0].serviceDate,
      } : null,
      pendingConfirmationCount: pendingConfirmationRows.length,
      nextPendingConfirmation: pendingConfirmationRows[0] ? {
        talentName: pendingConfirmationRows[0].talentName,
        activityName: pendingConfirmationRows[0].activityName,
        serviceDate: pendingConfirmationRows[0].serviceDate,
      } : null,
      overdueInvoiceCount: overdueInvoices.length,
      overdueInvoiceCents: overdueInvoices.reduce((sum, invoice) => sum + invoice.totalCents, 0),
    },
    finances: {
      currentMonthCommitmentsCents: currentMonthHfyCents + currentMonthDirectCents,
      owedToResidencyTalentCents: directTalentAmounts.reduce((sum, row) => sum + row.amountCents, 0),
      outstandingHfyInvoicesCents: openInvoices.reduce((sum, invoice) => sum + invoice.totalCents, 0),
      openInvoiceCount: openInvoices.length,
      overdueInvoiceCount: overdueInvoices.length,
    },
  };
}
