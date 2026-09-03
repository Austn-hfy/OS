import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/db/client";
import {
  assignments,
  attentionItems,
  daypartDayRules,
  dayparts,
  invoiceDeliveries,
  hfyTalentRequests,
  invoices,
  residencies,
  shifts,
  talent,
  talentDocuments,
  talentPaymentProfiles,
  residencyTalent,
  residencyContacts,
  publicCalendarLinkDayparts,
  publicCalendarLinks,
  platformSubscriptionInvoices,
  platformSubscriptions,
  scheduleOccurrences,
  scheduleOccurrenceTalent,
  users,
} from "@/db/schema";
import {
  calculateBillableAmountCents,
  grossMarginCents,
  hoursBetween,
  invoiceBalanceCents,
  invoiceVarianceCents,
  marginPercentage,
} from "@/domain/airtable-parity";
import { getInvoiceBrandingSettings } from "@/services/invoice-branding";
import { calculatePlatformMonthlyAmountCents, platformCadenceChargeCents } from "@/domain/platform-billing";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function hfyManagedDaypartRateAttentionCondition() {
  return and(
    eq(dayparts.active, true),
    eq(dayparts.type, "dj_artist"),
    eq(dayparts.billingMode, "billed_by_hfy"),
    sql`coalesce(${dayparts.defaultTalentRateCents}, 0) <= 0`,
  );
}

export const getResidencyList = cache(async function getResidencyList() {
  return getDb().select({
    id: residencies.id,
    name: residencies.name,
    cityState: residencies.cityState,
    tier: residencies.tier,
    active: residencies.active,
    timezone: residencies.timezone,
    defaultTalentRateCents: residencies.defaultTalentRateCents,
    clientHourlyRateCents: residencies.clientHourlyRateCents,
    needsDaypartRateAttention: sql<boolean>`count(${dayparts.id}) > 0`,
  }).from(residencies)
    .leftJoin(dayparts, and(eq(dayparts.residencyId, residencies.id), hfyManagedDaypartRateAttentionCondition()))
    .where(and(eq(residencies.active, true), eq(residencies.operatingMode, "operations")))
    .groupBy(residencies.id)
    .orderBy(asc(residencies.name));
});

export const getDeveloperResidencyList = cache(async function getDeveloperResidencyList() {
  return getDb().select({
    id: residencies.id,
    name: residencies.name,
    cityState: residencies.cityState,
    tier: residencies.tier,
    active: residencies.active,
    timezone: residencies.timezone,
    defaultTalentRateCents: residencies.defaultTalentRateCents,
    clientHourlyRateCents: residencies.clientHourlyRateCents,
  }).from(residencies)
    .where(eq(residencies.operatingMode, "operations"))
    .orderBy(desc(residencies.active), asc(residencies.name));
});

export async function getPlatformRevenueDashboard() {
  const plans = await getDb().select({
    id: platformSubscriptions.id,
    residencyId: residencies.id,
    residencyName: residencies.name,
    residencyActive: residencies.active,
    status: platformSubscriptions.status,
    cadence: platformSubscriptions.cadence,
    talentProgramSessions: platformSubscriptions.talentProgramSessions,
    talentSessionUnitAmountCents: platformSubscriptions.talentSessionUnitAmountCents,
    housePrograms: platformSubscriptions.housePrograms,
    houseProgramUnitAmountCents: platformSubscriptions.houseProgramUnitAmountCents,
    cardBrand: platformSubscriptions.cardBrand,
    cardLast4: platformSubscriptions.cardLast4,
    nextChargeAt: platformSubscriptions.nextChargeAt,
  }).from(platformSubscriptions)
    .innerJoin(residencies, eq(platformSubscriptions.residencyId, residencies.id))
    .where(eq(residencies.operatingMode, "operations"))
    .orderBy(desc(residencies.active), asc(residencies.name));
  const latestInvoiceRows = plans.length ? await getDb().select({
    platformSubscriptionId: platformSubscriptionInvoices.platformSubscriptionId,
    status: platformSubscriptionInvoices.status,
    invoiceDate: platformSubscriptionInvoices.invoiceDate,
    amountDueCents: platformSubscriptionInvoices.amountDueCents,
  }).from(platformSubscriptionInvoices)
    .where(inArray(platformSubscriptionInvoices.platformSubscriptionId, plans.map((plan) => plan.id)))
    .orderBy(desc(platformSubscriptionInvoices.invoiceDate), desc(platformSubscriptionInvoices.createdAt)) : [];

  return plans.map((plan) => {
    const monthlyAmountCents = calculatePlatformMonthlyAmountCents(plan);
    return {
      ...plan,
      nextChargeAt: plan.nextChargeAt?.toISOString() ?? null,
      monthlyAmountCents,
      cadenceChargeCents: platformCadenceChargeCents(monthlyAmountCents, plan.cadence),
      latestInvoice: latestInvoiceRows.find((invoice) => invoice.platformSubscriptionId === plan.id) ?? null,
    };
  });
}

export async function getBilledByHfyWorkQueue() {
  const rows = await getDb().select({
    id: dayparts.id,
    residencyId: residencies.id,
    residencyName: residencies.name,
    residencyCityState: residencies.cityState,
    residencyTier: residencies.tier,
    residencyActive: residencies.active,
    name: dayparts.name,
    room: dayparts.room,
    color: dayparts.color,
    active: dayparts.active,
    activeUntil: dayparts.activeUntil,
    defaultTalentRateCents: dayparts.defaultTalentRateCents,
    sortOrder: dayparts.sortOrder,
    weekday: daypartDayRules.weekday,
    startMinute: daypartDayRules.startMinute,
    endMinute: daypartDayRules.endMinute,
    defaultDjCount: daypartDayRules.defaultDjCount,
  }).from(dayparts)
    .innerJoin(residencies, eq(dayparts.residencyId, residencies.id))
    .leftJoin(daypartDayRules, eq(daypartDayRules.daypartId, dayparts.id))
    .where(and(
      eq(dayparts.billingMode, "billed_by_hfy"),
      eq(residencies.operatingMode, "operations"),
    ))
    .orderBy(desc(dayparts.active), asc(residencies.name), asc(dayparts.sortOrder), asc(daypartDayRules.weekday));

  const queue = new Map<string, Omit<(typeof rows)[number], "weekday" | "startMinute" | "endMinute" | "defaultDjCount"> & {
    rules: Array<{ weekday: number; startMinute: number; endMinute: number; defaultDjCount: number | null }>;
  }>();

  for (const row of rows) {
    const existing = queue.get(row.id);
    if (existing) {
      if (row.weekday !== null && row.startMinute !== null && row.endMinute !== null) {
        existing.rules.push({ weekday: row.weekday, startMinute: row.startMinute, endMinute: row.endMinute, defaultDjCount: row.defaultDjCount });
      }
      continue;
    }
    const { weekday, startMinute, endMinute, defaultDjCount, ...daypart } = row;
    queue.set(row.id, {
      ...daypart,
      rules: weekday !== null && startMinute !== null && endMinute !== null
        ? [{ weekday, startMinute, endMinute, defaultDjCount }]
        : [],
    });
  }

  return [...queue.values()];
}

export async function getPendingHfyTalentRequests() {
  const [requests, artists] = await Promise.all([
    getDb().select({
      id: hfyTalentRequests.id,
      residencyId: hfyTalentRequests.residencyId,
      residencyName: residencies.name,
      residencyTimezone: residencies.timezone,
      shiftId: shifts.id,
      shiftName: shifts.name,
      room: shifts.room,
      serviceDate: shifts.serviceDate,
      startsAt: shifts.startsAt,
      endsAt: shifts.endsAt,
      createdAt: hfyTalentRequests.createdAt,
      defaultTalentRateCents: residencies.defaultTalentRateCents,
      clientHourlyRateCents: residencies.clientHourlyRateCents,
    }).from(hfyTalentRequests)
      .innerJoin(shifts, eq(hfyTalentRequests.shiftId, shifts.id))
      .innerJoin(residencies, eq(hfyTalentRequests.residencyId, residencies.id))
      .where(eq(hfyTalentRequests.status, "pending"))
      .orderBy(asc(shifts.serviceDate), asc(shifts.startsAt)),
    getDb().select({
      id: talent.id,
      stageName: talent.stageName,
      homeMarket: talent.homeMarket,
      exclusiveResidencyId: talent.exclusiveResidencyId,
    }).from(talent).where(and(
      eq(talent.ownership, "hfy"),
      eq(talent.talentStatus, "active"),
      isNull(talent.archivedAt),
    )).orderBy(asc(talent.stageName)),
  ]);
  return {
    requests: requests.map((request) => {
      const { defaultTalentRateCents, clientHourlyRateCents, ...publicRequest } = request;
      return {
        ...publicRequest,
        startsAt: request.startsAt.toISOString(),
        endsAt: request.endsAt.toISOString(),
        createdAt: request.createdAt.toISOString(),
        ratesConfigured: defaultTalentRateCents > 0 && clientHourlyRateCents > 0,
      };
    }),
    artists,
  };
}

export type PublicCalendarLinkSettings = {
  hasLink: boolean;
  scope: "all" | "selected";
  daypartIds: string[];
};

export async function getPublicCalendarLinkSettings(residencyId: string): Promise<PublicCalendarLinkSettings> {
  const rows = await getDb().select({
    residencyId: publicCalendarLinks.residencyId,
    scope: publicCalendarLinks.scope,
    daypartId: publicCalendarLinkDayparts.daypartId,
  })
    .from(publicCalendarLinks)
    .leftJoin(publicCalendarLinkDayparts, eq(publicCalendarLinks.residencyId, publicCalendarLinkDayparts.residencyId))
    .where(eq(publicCalendarLinks.residencyId, residencyId))
    .orderBy(asc(publicCalendarLinkDayparts.daypartId));
  if (!rows.length) return { hasLink: false, scope: "all", daypartIds: [] };
  return {
    hasLink: true,
    scope: rows[0].scope,
    daypartIds: rows.flatMap((row) => row.daypartId ? [row.daypartId] : []),
  };
}

export async function getDashboardData() {
  const database = getDb();
  const [residencyRows, shiftRows, assignmentRows, invoiceRows, attentionRows] = await Promise.all([
    getResidencyList(),
    database.select({ id: shifts.id, residencyId: shifts.residencyId, serviceDate: shifts.serviceDate })
      .from(shifts).where(and(gte(shifts.serviceDate, todayUtc()), inArray(shifts.economicsMode, ["hfy", "hfy_request"]))),
    database.select({
      residencyId: shifts.residencyId,
      bookingStatus: assignments.bookingStatus,
      payoutStatus: assignments.payoutStatus,
      totalCompensationCents: assignments.totalCompensationCents,
    }).from(assignments).innerJoin(shifts, eq(assignments.shiftId, shifts.id))
      .where(inArray(assignments.source, ["internal", "hfy_request"])),
    database.select().from(invoices).orderBy(desc(invoices.billingPeriodEnd)),
    database.select({ residencyId: attentionItems.residencyId }).from(attentionItems).where(eq(attentionItems.status, "open")),
  ]);

  return residencyRows.map((residency) => {
    const residencyAssignments = assignmentRows.filter((assignment) => assignment.residencyId === residency.id);
    const residencyInvoices = invoiceRows.filter((invoice) => invoice.residencyId === residency.id);
    return {
      ...residency,
      upcomingShiftCount: shiftRows.filter((shift) => shift.residencyId === residency.id).length,
      openAssignmentCount: residencyAssignments.filter((assignment) => ["open", "offered", "pending_hfy_confirmation"].includes(assignment.bookingStatus)).length,
      readyToPayCents: residencyAssignments
        .filter((assignment) => assignment.payoutStatus === "ready_to_pay")
        .reduce((sum, assignment) => sum + assignment.totalCompensationCents, 0),
      outstandingReceivablesCents: residencyInvoices.reduce(
        (sum, invoice) => sum + invoiceBalanceCents(invoice.status, invoice.totalCents),
        0,
      ),
      needsInvoiceReview: residencyInvoices.filter((invoice) => invoice.status === "draft").length,
      attentionCount: attentionRows.filter((item) => item.residencyId === residency.id).length,
    };
  });
}

export async function getCalendarData(residencyId?: string, range?: { from: string; to: string }) {
  const database = getDb();
  const dateWhere = range
    ? and(gte(shifts.serviceDate, range.from), lte(shifts.serviceDate, range.to))
    : gte(shifts.serviceDate, todayUtc());
  const shiftWhere = residencyId ? and(eq(shifts.residencyId, residencyId), dateWhere) : dateWhere;
  const shiftRows = await database.select({
    id: shifts.id,
    residencyId: shifts.residencyId,
    daypartId: shifts.daypartId,
    daypartColor: dayparts.color,
    shiftCalendarColor: shifts.calendarColor,
    residencyName: residencies.name,
    residencyTimezone: residencies.timezone,
    name: shifts.name,
    serviceDate: shifts.serviceDate,
    room: shifts.room,
    startsAt: shifts.startsAt,
    endsAt: shifts.endsAt,
    billingStatus: shifts.billingStatus,
    clientRateCents: shifts.clientRateCents,
    clientRateOverrideCents: shifts.clientRateOverrideCents,
    invoiceId: shifts.invoiceId,
    invoiceLinkIssue: shifts.invoiceLinkIssue,
    invoiceLinkNote: shifts.invoiceLinkNote,
    notes: shifts.notes,
    programDetails: shifts.programDetails,
    manualHostName: shifts.manualHostName,
    economicsMode: shifts.economicsMode,
    clientTalentDefaultRateCents: shifts.clientTalentDefaultRateCents,
    hfyRequestId: hfyTalentRequests.id,
  }).from(shifts)
    .innerJoin(residencies, eq(shifts.residencyId, residencies.id))
    .leftJoin(dayparts, eq(shifts.daypartId, dayparts.id))
    .leftJoin(hfyTalentRequests, eq(hfyTalentRequests.shiftId, shifts.id))
    .where(shiftWhere)
    .orderBy(asc(shifts.startsAt));

  const shiftIds = shiftRows.map((shift) => shift.id);
  const assignmentRows = shiftIds.length
    ? await database.select({
      id: assignments.id,
      shiftId: assignments.shiftId,
      talentId: assignments.talentId,
      talentName: talent.stageName,
      guestName: assignments.guestName,
      startsAt: assignments.startsAt,
      endsAt: assignments.endsAt,
      bookingStatus: assignments.bookingStatus,
      payoutStatus: assignments.payoutStatus,
      source: assignments.source,
      compensationType: assignments.compensationType,
      talentRateCents: assignments.talentRateCents,
      talentRateOverrideCents: assignments.talentRateOverrideCents,
      fixedFeeCents: assignments.fixedFeeCents,
      totalCompensationCents: assignments.totalCompensationCents,
    }).from(assignments)
      .leftJoin(talent, eq(assignments.talentId, talent.id))
      .where(inArray(assignments.shiftId, shiftIds))
      .orderBy(asc(assignments.startsAt))
    : [];

  return shiftRows.map((shift) => ({
    ...shift,
    assignments: assignmentRows.filter((assignment) => assignment.shiftId === shift.id),
  }));
}

export async function getScheduleOccurrenceData(residencyId?: string, range?: { from: string; to: string }) {
  const database = getDb();
  const dateWhere = range
    ? and(gte(scheduleOccurrences.serviceDate, range.from), lte(scheduleOccurrences.serviceDate, range.to))
    : gte(scheduleOccurrences.serviceDate, todayUtc());
  const occurrenceWhere = residencyId
    ? and(eq(scheduleOccurrences.residencyId, residencyId), dateWhere)
    : dateWhere;
  const occurrenceRows = await database.select({
    id: scheduleOccurrences.id,
    residencyId: scheduleOccurrences.residencyId,
    daypartId: scheduleOccurrences.daypartId,
    residencyName: residencies.name,
    residencyTimezone: residencies.timezone,
    name: scheduleOccurrences.name,
    room: scheduleOccurrences.room,
    color: scheduleOccurrences.color,
    type: scheduleOccurrences.type,
    billingMode: dayparts.billingMode,
    notes: scheduleOccurrences.notes,
    programDetails: scheduleOccurrences.programDetails,
    manualHostName: scheduleOccurrences.manualHostName,
    serviceDate: scheduleOccurrences.serviceDate,
    startsAt: scheduleOccurrences.startsAt,
    endsAt: scheduleOccurrences.endsAt,
  }).from(scheduleOccurrences)
    .innerJoin(residencies, eq(scheduleOccurrences.residencyId, residencies.id))
    .leftJoin(dayparts, eq(scheduleOccurrences.daypartId, dayparts.id))
    .where(occurrenceWhere)
    .orderBy(asc(scheduleOccurrences.startsAt));
  const occurrenceIds = occurrenceRows.map((row) => row.id);
  const talentRows = occurrenceIds.length ? await database.select({
    id: scheduleOccurrenceTalent.id,
    occurrenceId: scheduleOccurrenceTalent.occurrenceId,
    talentId: scheduleOccurrenceTalent.talentId,
    talentName: talent.stageName,
    startsAt: scheduleOccurrenceTalent.startsAt,
    endsAt: scheduleOccurrenceTalent.endsAt,
  }).from(scheduleOccurrenceTalent)
    .innerJoin(talent, eq(scheduleOccurrenceTalent.talentId, talent.id))
    .where(inArray(scheduleOccurrenceTalent.occurrenceId, occurrenceIds))
    .orderBy(asc(scheduleOccurrenceTalent.startsAt)) : [];

  return occurrenceRows.map((occurrence) => ({
    ...occurrence,
    assignments: talentRows.filter((row) => row.occurrenceId === occurrence.id),
  }));
}

export async function getTalentDirectory(residencyId?: string) {
  const database = getDb();
  if (!residencyId) return database.select().from(talent)
    .where(and(eq(talent.ownership, "hfy"), eq(talent.talentStatus, "active"), isNull(talent.archivedAt)))
    .orderBy(desc(talent.priority), asc(talent.stageName));
  const approvals = await database.select({ talentId: residencyTalent.talentId })
    .from(residencyTalent)
    .where(and(
      eq(residencyTalent.residencyId, residencyId),
      eq(residencyTalent.active, true),
      eq(residencyTalent.clientVisible, true),
    ));
  if (!approvals.length) return [];
  return database.select().from(talent)
    .where(and(
      inArray(talent.id, approvals.map((item) => item.talentId)),
      eq(talent.talentStatus, "active"),
      isNull(talent.archivedAt),
      or(isNull(talent.exclusiveResidencyId), eq(talent.exclusiveResidencyId, residencyId)),
    ))
    .orderBy(desc(talent.priority), asc(talent.stageName));
}

export async function getArtistLookupData(residencyId?: string) {
  const database = getDb();
  const scopedTalentIds = residencyId
    ? (await database.select({ talentId: residencyTalent.talentId }).from(residencyTalent).where(and(
      eq(residencyTalent.residencyId, residencyId),
      eq(residencyTalent.active, true),
      eq(residencyTalent.clientVisible, true),
    ))).map((row) => row.talentId)
    : null;
  const artistRows = scopedTalentIds
    ? scopedTalentIds.length
      ? await database.select().from(talent).where(and(
        inArray(talent.id, scopedTalentIds),
        or(isNull(talent.exclusiveResidencyId), eq(talent.exclusiveResidencyId, residencyId!)),
      )).orderBy(desc(talent.priority), asc(talent.stageName))
      : []
    : await database.select().from(talent)
      .where(eq(talent.ownership, "hfy"))
      .orderBy(desc(talent.priority), asc(talent.stageName));
  const artistIds = artistRows.map((artist) => artist.id);
  if (!artistIds.length) return [];

  const [paymentRows, visibilityRows, assignmentRows, trackingRows, documentRows] = await Promise.all([
    database.select().from(talentPaymentProfiles).where(inArray(talentPaymentProfiles.talentId, artistIds)),
    database.select({
      talentId: residencyTalent.talentId,
      residencyId: residencyTalent.residencyId,
      residencyName: residencies.name,
    }).from(residencyTalent)
      .innerJoin(residencies, eq(residencyTalent.residencyId, residencies.id))
      .where(and(
        inArray(residencyTalent.talentId, artistIds),
        eq(residencyTalent.active, true),
        eq(residencyTalent.clientVisible, true),
        eq(residencies.active, true),
      ))
      .orderBy(asc(residencies.name)),
    database.select({
      id: assignments.id,
      talentId: assignments.talentId,
      bookingStatus: assignments.bookingStatus,
      payoutStatus: assignments.payoutStatus,
      totalCompensationCents: assignments.totalCompensationCents,
      startsAt: assignments.startsAt,
      endsAt: assignments.endsAt,
      shiftName: shifts.name,
      serviceDate: shifts.serviceDate,
      room: shifts.room,
      residencyId: residencies.id,
      residencyName: residencies.name,
      residencyTimezone: residencies.timezone,
    }).from(assignments)
      .innerJoin(shifts, eq(assignments.shiftId, shifts.id))
      .innerJoin(residencies, eq(shifts.residencyId, residencies.id))
      .where(and(
        inArray(assignments.talentId, artistIds),
        residencyId ? eq(shifts.residencyId, residencyId) : undefined,
        or(eq(assignments.payoutStatus, "ready_to_pay"), gte(shifts.serviceDate, todayUtc())),
      ))
      .orderBy(asc(shifts.serviceDate), asc(assignments.startsAt)),
    database.select({
      id: scheduleOccurrenceTalent.id,
      talentId: scheduleOccurrenceTalent.talentId,
      startsAt: scheduleOccurrenceTalent.startsAt,
      endsAt: scheduleOccurrenceTalent.endsAt,
      shiftName: scheduleOccurrences.name,
      serviceDate: scheduleOccurrences.serviceDate,
      room: scheduleOccurrences.room,
      residencyId: residencies.id,
      residencyName: residencies.name,
      residencyTimezone: residencies.timezone,
    }).from(scheduleOccurrenceTalent)
      .innerJoin(scheduleOccurrences, eq(scheduleOccurrenceTalent.occurrenceId, scheduleOccurrences.id))
      .innerJoin(residencies, eq(scheduleOccurrences.residencyId, residencies.id))
      .where(and(
        inArray(scheduleOccurrenceTalent.talentId, artistIds),
        residencyId ? eq(scheduleOccurrences.residencyId, residencyId) : undefined,
        gte(scheduleOccurrences.serviceDate, todayUtc()),
      ))
      .orderBy(asc(scheduleOccurrences.serviceDate), asc(scheduleOccurrenceTalent.startsAt)),
    database.select({ talentId: talentDocuments.talentId, kind: talentDocuments.kind })
      .from(talentDocuments)
      .where(inArray(talentDocuments.talentId, artistIds)),
  ]);

  const upcomingStatuses = new Set(["offered", "pending_hfy_confirmation", "confirmed"]);
  return artistRows.map((artist) => {
    const artistAssignments = assignmentRows.filter((assignment) => assignment.talentId === artist.id);
    const outstandingAssignments = artistAssignments
      .filter((assignment) => assignment.payoutStatus === "ready_to_pay")
      .map((assignment) => ({
        id: assignment.id,
        residencyId: assignment.residencyId,
        residencyName: assignment.residencyName,
        residencyTimezone: assignment.residencyTimezone,
        shiftName: assignment.shiftName,
        serviceDate: assignment.serviceDate,
        startsAt: assignment.startsAt.toISOString(),
        endsAt: assignment.endsAt.toISOString(),
        amountCents: assignment.totalCompensationCents,
      }));
    const upcomingBookings = artistAssignments
      .filter((assignment) => assignment.serviceDate >= todayUtc() && upcomingStatuses.has(assignment.bookingStatus))
      .map((assignment) => ({
        id: assignment.id,
        residencyId: assignment.residencyId,
        residencyName: assignment.residencyName,
        residencyTimezone: assignment.residencyTimezone,
        shiftName: assignment.shiftName,
        room: assignment.room,
        serviceDate: assignment.serviceDate,
        startsAt: assignment.startsAt.toISOString(),
        endsAt: assignment.endsAt.toISOString(),
        bookingStatus: assignment.bookingStatus,
      })).concat(trackingRows
        .filter((booking) => booking.talentId === artist.id)
        .map((booking) => ({
          id: booking.id,
          residencyId: booking.residencyId,
          residencyName: booking.residencyName,
          residencyTimezone: booking.residencyTimezone,
          shiftName: booking.shiftName,
          room: booking.room,
          serviceDate: booking.serviceDate,
          startsAt: booking.startsAt.toISOString(),
          endsAt: booking.endsAt.toISOString(),
          bookingStatus: "confirmed",
        })))
      .sort((left, right) => left.serviceDate.localeCompare(right.serviceDate) || left.startsAt.localeCompare(right.startsAt));
    const clientVisibleResidencies = visibilityRows.filter((visibility) => visibility.talentId === artist.id);
    const paymentProfile = paymentRows.find((profile) => profile.talentId === artist.id);
    const documents = documentRows.filter((document) => document.talentId === artist.id);
    const liveOutstandingOwedCents = outstandingAssignments.reduce((sum, assignment) => sum + assignment.amountCents, 0);
    return {
      ...artist,
      clientVisibleForCurrentResidency: residencyId ? clientVisibleResidencies.some((visibility) => visibility.residencyId === residencyId) : null,
      scopedResidencyId: residencyId ?? null,
      clientVisibleResidencies: clientVisibleResidencies.map((visibility) => ({ id: visibility.residencyId, name: visibility.residencyName })),
      liveOutstandingOwedCents,
      totalOutstandingOwedCents: residencyId ? liveOutstandingOwedCents : liveOutstandingOwedCents + artist.legacyOutstandingOwedCents,
      outstandingAssignments,
      upcomingBookings,
      paymentProfile: paymentProfile ? {
        paymentMethod: paymentProfile.paymentMethod,
        zelleEmail: paymentProfile.zelleEmail,
        zellePhone: paymentProfile.zellePhone,
        lastFour: paymentProfile.lastFour,
      } : null,
      hasW9: documents.some((document) => document.kind.toLowerCase().includes("w9") || document.kind.toLowerCase().includes("w-9")),
      documentCount: documents.length,
    };
  });
}

export async function getPayoutQueue(residencyId?: string) {
  return getDb().select({
    id: assignments.id,
    residencyId: residencies.id,
    talentId: assignments.talentId,
    talentName: talent.stageName,
    talentFullName: talent.fullName,
    talentEmail: talent.email,
    talentPhone: talent.phone,
    residencyName: residencies.name,
    residencyTimezone: residencies.timezone,
    shiftName: shifts.name,
    serviceDate: shifts.serviceDate,
    startsAt: assignments.startsAt,
    endsAt: assignments.endsAt,
    bookingStatus: assignments.bookingStatus,
    compensationType: assignments.compensationType,
    talentRateCents: assignments.talentRateCents,
    talentRateOverrideCents: assignments.talentRateOverrideCents,
    totalCompensationCents: assignments.totalCompensationCents,
    payoutStatus: assignments.payoutStatus,
    paidAt: assignments.paidAt,
    paidAmountCents: assignments.paidAmountCents,
    paymentReference: assignments.paymentReference,
    paymentMethod: talentPaymentProfiles.paymentMethod,
    zelleEmail: talentPaymentProfiles.zelleEmail,
    zellePhone: talentPaymentProfiles.zellePhone,
    paymentLastFour: talentPaymentProfiles.lastFour,
  }).from(assignments)
    .innerJoin(shifts, eq(assignments.shiftId, shifts.id))
    .innerJoin(residencies, eq(shifts.residencyId, residencies.id))
    .leftJoin(talent, eq(assignments.talentId, talent.id))
    .leftJoin(talentPaymentProfiles, eq(talent.id, talentPaymentProfiles.talentId))
    .where(residencyId
      ? and(eq(shifts.residencyId, residencyId), inArray(assignments.source, ["internal", "hfy_request"]))
      : inArray(assignments.source, ["internal", "hfy_request"]))
    .orderBy(asc(shifts.serviceDate), asc(talent.stageName));
}

export async function getCompanyRosterData() {
  const database = getDb();
  const [artistRows, assignmentRows, residencyRows] = await Promise.all([
    database.select({
      id: talent.id,
      stageName: talent.stageName,
      homeMarket: talent.homeMarket,
      genres: talent.genres,
      instagramHandle: talent.instagramHandle,
      talentStatus: talent.talentStatus,
      archivedAt: talent.archivedAt,
      exclusiveResidencyId: talent.exclusiveResidencyId,
    }).from(talent)
      .where(and(eq(talent.ownership, "hfy"), eq(talent.talentStatus, "active"), isNull(talent.archivedAt)))
      .orderBy(asc(talent.stageName)),
    database.select({
      talentId: residencyTalent.talentId,
      residencyId: residencyTalent.residencyId,
      residencyName: residencies.name,
    }).from(residencyTalent)
      .innerJoin(residencies, eq(residencyTalent.residencyId, residencies.id))
      .where(and(
        eq(residencyTalent.active, true),
        eq(residencies.active, true),
        eq(residencies.operatingMode, "operations"),
      ))
      .orderBy(asc(residencies.name)),
    getResidencyList(),
  ]);

  return {
    artists: artistRows.map((artist) => ({
      ...artist,
      assignedResidencies: assignmentRows
        .filter((assignment) => assignment.talentId === artist.id)
        .map((assignment) => ({ id: assignment.residencyId, name: assignment.residencyName })),
    })),
    residencies: residencyRows,
  };
}

export async function getInvoices(residencyId?: string) {
  const database = getDb();
  const rows = await database.select({
    id: invoices.id,
    residencyId: invoices.residencyId,
    residencyName: residencies.name,
    autoSendInvoices: residencies.autoSendInvoices,
    autoSendReason: residencies.autoSendReason,
    invoiceNumber: invoices.invoiceNumber,
    kind: invoices.kind,
    billingPeriodStart: invoices.billingPeriodStart,
    billingPeriodEnd: invoices.billingPeriodEnd,
    status: invoices.status,
    totalCents: invoices.totalCents,
    sentAt: invoices.sentAt,
    paidAt: invoices.paidAt,
    pdfStoragePath: invoices.pdfStoragePath,
    pdfGeneratedAt: invoices.pdfGeneratedAt,
    pdfByteSize: invoices.pdfByteSize,
    deliveryStatus: invoiceDeliveries.status,
  }).from(invoices)
    .innerJoin(residencies, eq(invoices.residencyId, residencies.id))
    .leftJoin(invoiceDeliveries, and(
      eq(invoiceDeliveries.invoiceId, invoices.id),
      eq(invoiceDeliveries.invoiceVersion, invoices.version),
    ))
    .where(residencyId ? eq(invoices.residencyId, residencyId) : undefined)
    .orderBy(desc(invoices.billingPeriodEnd));

  const invoiceIds = rows.map((invoice) => invoice.id);
  const shiftRows = invoiceIds.length ? await database.select({
    id: shifts.id,
    invoiceId: shifts.invoiceId,
    startsAt: shifts.startsAt,
    endsAt: shifts.endsAt,
    clientRateCents: shifts.clientRateCents,
  }).from(shifts).where(inArray(shifts.invoiceId, invoiceIds)) : [];
  const shiftIds = shiftRows.map((shift) => shift.id);
  const assignmentRows = shiftIds.length ? await database.select({
    shiftId: assignments.shiftId,
    totalCompensationCents: assignments.totalCompensationCents,
  }).from(assignments).where(inArray(assignments.shiftId, shiftIds)) : [];

  return rows.map((invoice) => ({
    ...invoice,
    calculatedHours: shiftRows.filter((shift) => shift.invoiceId === invoice.id)
      .reduce((sum, shift) => sum + hoursBetween(shift.startsAt, shift.endsAt), 0),
    calculatedTotalCents: invoice.kind === "custom" ? invoice.totalCents : shiftRows.filter((shift) => shift.invoiceId === invoice.id)
      .reduce((sum, shift) => sum + calculateBillableAmountCents(shift.startsAt, shift.endsAt, shift.clientRateCents), 0),
    talentCostCents: assignmentRows
      .filter((assignment) => shiftRows.some((shift) => shift.id === assignment.shiftId && shift.invoiceId === invoice.id))
      .reduce((sum, assignment) => sum + assignment.totalCompensationCents, 0),
    balanceCents: invoiceBalanceCents(invoice.status, invoice.totalCents),
  })).map((invoice) => ({
    ...invoice,
    varianceCents: invoiceVarianceCents(invoice.totalCents, invoice.calculatedTotalCents),
    grossMarginCents: grossMarginCents(invoice.calculatedTotalCents, invoice.talentCostCents),
    marginPercentage: marginPercentage(invoice.calculatedTotalCents, invoice.talentCostCents),
  }));
}

export async function getInvoiceWorkspace(residencyId: string) {
  const database = getDb();
  const [residency] = await database.select({
    id: residencies.id,
    name: residencies.name,
    tier: residencies.tier,
    timezone: residencies.timezone,
    billingContactName: residencies.billingContactName,
    billingContactEmail: residencies.billingContactEmail,
    billingAddress: residencies.billingAddress,
    invoicePrefix: residencies.invoicePrefix,
    paymentTermsDays: residencies.paymentTermsDays,
    invoiceFrequency: residencies.invoiceFrequency,
    billingCycleStartWeekday: residencies.billingCycleStartWeekday,
    billingCycleLengthDays: residencies.billingCycleLengthDays,
    invoiceLinePresentation: residencies.invoiceLinePresentation,
    defaultInvoiceNote: residencies.defaultInvoiceNote,
    autoSendInvoices: residencies.autoSendInvoices,
    autoSendReason: residencies.autoSendReason,
  }).from(residencies).where(and(eq(residencies.id, residencyId), eq(residencies.operatingMode, "operations"))).limit(1);
  if (!residency) return null;

  const [eligibleShifts, residencyInvoices] = await Promise.all([
    database.select({
      id: shifts.id,
      name: shifts.name,
      serviceDate: shifts.serviceDate,
      room: shifts.room,
      startsAt: shifts.startsAt,
      endsAt: shifts.endsAt,
      clientRateCents: shifts.clientRateCents,
      billingStatus: shifts.billingStatus,
    }).from(shifts).where(and(
      eq(shifts.residencyId, residencyId),
      isNull(shifts.invoiceId),
      inArray(shifts.billingStatus, ["pending", "reviewed"]),
    )).orderBy(asc(shifts.serviceDate), asc(shifts.startsAt)),
    database.select({ invoiceNumber: invoices.invoiceNumber }).from(invoices).where(eq(invoices.residencyId, residencyId)),
  ]);

  const year = new Date().getFullYear();
  const sequence = String(residencyInvoices.length + 1).padStart(3, "0");
  return {
    residency,
    eligibleShifts: eligibleShifts.map((shift) => ({
      ...shift,
      startsAt: shift.startsAt.toISOString(),
      endsAt: shift.endsAt.toISOString(),
      hours: hoursBetween(shift.startsAt, shift.endsAt),
      amountCents: calculateBillableAmountCents(shift.startsAt, shift.endsAt, shift.clientRateCents),
    })),
    defaultInvoiceNumber: `${residency.invoicePrefix}-${year}-${sequence}`,
  };
}

export async function getSetupData() {
  const database = getDb();
  const [residencyRows, contacts, calendarLinks, invoiceBranding] = await Promise.all([
    database.select({
      id: residencies.id,
      name: residencies.name,
      cityState: residencies.cityState,
      timezone: residencies.timezone,
      tier: residencies.tier,
      active: residencies.active,
      internalNotes: residencies.internalNotes,
    }).from(residencies).where(eq(residencies.operatingMode, "operations")).orderBy(desc(residencies.active), asc(residencies.name)),
    database.select({
      id: residencyContacts.id,
      residencyId: residencyContacts.residencyId,
      name: residencyContacts.name,
      title: residencyContacts.title,
      email: residencyContacts.email,
      phone: residencyContacts.phone,
      accessRole: residencyContacts.accessRole,
      invitationStatus: residencyContacts.invitationStatus,
      isPrimary: residencyContacts.isPrimary,
      active: residencyContacts.active,
      userId: residencyContacts.userId,
      isInternalTest: users.isInternalTest,
    }).from(residencyContacts)
      .leftJoin(users, eq(residencyContacts.userId, users.id))
      .where(eq(residencyContacts.active, true))
      .orderBy(asc(residencyContacts.name)),
    database.select({ residencyId: publicCalendarLinks.residencyId }).from(publicCalendarLinks),
    getInvoiceBrandingSettings(),
  ]);
  const linkedResidencies = new Set(calendarLinks.map((link) => link.residencyId));
  return {
    residencies: residencyRows.map((residency) => ({ ...residency, hasPublicCalendarLink: linkedResidencies.has(residency.id) })),
    contacts: contacts.map((contact) => ({ ...contact, hasAccount: Boolean(contact.userId), isInternalTest: Boolean(contact.isInternalTest) })),
    invoiceBranding,
  };
}

export async function getPipelineLeads() {
  const now = Date.now();
  const rows = await getDb().select({
    id: residencies.id,
    companyName: residencies.name,
    primaryContactName: residencies.primaryContactName,
    primaryContactPhone: residencies.primaryContactPhone,
    primaryContactEmail: residencies.primaryContactEmail,
    source: residencies.leadSource,
    pipelineStatus: residencies.pipelineStatus,
    pipelineStatusChangedAt: residencies.pipelineStatusChangedAt,
    notes: residencies.leadNotes,
    createdAt: residencies.createdAt,
  }).from(residencies).where(and(
    eq(residencies.active, true),
    eq(residencies.operatingMode, "pipeline"),
  )).orderBy(desc(residencies.pipelineStatusChangedAt), asc(residencies.name));
  return rows.map((lead) => ({
    ...lead,
    pipelineStatusChangedAt: lead.pipelineStatusChangedAt.toISOString(),
    createdAt: lead.createdAt.toISOString(),
    daysInCurrentStatus: Math.max(0, Math.floor((now - lead.pipelineStatusChangedAt.getTime()) / 86_400_000)),
  }));
}
