import { createHash } from "node:crypto";

export const PRODUCTION_SUPABASE_PROJECT_REF: string = "tkfsgifnywbwjdkxjhae";
export const STAGING_SUPABASE_PROJECT_REF: string = "ucrtbevvdfkceudknyxe";

const SYNC_NAMESPACE = "hfy-os-staging-structure-sync-v1";

export type SourceClientAccount = {
  id: string;
  name: string;
  active: boolean;
};

export type SourceResidency = {
  id: string;
  clientAccountId: string;
  slug: string;
  name: string;
  cityState: string;
  timezone: string;
  tier: "operations_only" | "complete";
  operatingMode: "pipeline" | "operations";
  active: boolean;
  leadSource: "inbound" | "outbound" | null;
  pipelineStatus: string;
  pipelineStatusChangedAt: Date;
  convertedAt: Date | null;
  defaultTalentRateCents: number;
  clientHourlyRateCents: number;
  paymentTermsDays: number;
  invoiceFrequency: string;
  billingCycleStartWeekday: number;
  billingCycleLengthDays: number;
  invoiceLinePresentation: "service_detail" | "daily_summary" | "period_summary";
  defaultInvoiceNote: string;
  schedulingPattern: string;
  invoicePrefix: string;
  clientPaymentStatusVisible: boolean;
};

export type SourceDaypart = {
  id: string;
  residencyId: string;
  name: string;
  room: string;
  color: string;
  type: "dj_artist" | "house_activity";
  billingMode: "billed_by_hfy" | "tracking_only" | null;
  scheduleMode: "standing_weekly" | "calendar_only";
  suggestedStartMinute: number | null;
  suggestedEndMinute: number | null;
  defaultTalentRateCents: number | null;
  clientDefaultRateCents: number | null;
  activeUntil: string | null;
  active: boolean;
  sortOrder: number;
};

export type SourceDayRule = {
  id: string;
  daypartId: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  defaultDjCount: number | null;
};

export type SourceDateException = {
  id: string;
  daypartId: string;
  serviceDate: string;
  kind: "skip" | "override";
  startMinute: number | null;
  endMinute: number | null;
};

export type SourceTalent = {
  id: string;
  stageName: string;
  ownership: "hfy" | "residency";
  owningResidencyId: string | null;
  exclusiveResidencyId: string | null;
  rosterStatus: "needs_review" | "ready";
  talentStatus: "active" | "inactive";
  archivedAt: Date | null;
  homeMarket: string;
  genres: string[];
  priority: number | null;
  hasPaymentProfile: boolean;
  paymentMethod: string;
  hasTaxDocument: boolean;
};

export type SourceRosterAssignment = {
  residencyId: string;
  talentId: string;
  active: boolean;
  clientVisible: boolean;
};

export type ProductionStructureSnapshot = {
  clientAccounts: SourceClientAccount[];
  residencies: SourceResidency[];
  dayparts: SourceDaypart[];
  dayRules: SourceDayRule[];
  dateExceptions: SourceDateException[];
  talent: SourceTalent[];
  rosterAssignments: SourceRosterAssignment[];
};

export type ExistingStagingState = {
  residencyId: string | null;
  clientAccountId: string | null;
  clientAccountSharedWithOtherResidency: boolean;
  dayparts: Array<{ id: string; name: string; active: boolean }>;
  talent: Array<{ id: string; airtableRecordId: string | null }>;
  rosterAssignments: Array<{ talentId: string; active: boolean; clientVisible: boolean }>;
};

export type SanitizedTalent = {
  id: string;
  stagingSyncKey: string;
  stageName: string;
  fullName: string;
  email: string;
  phone: string;
  instagramHandle: string;
  clientContact: string;
  ownership: "hfy" | "residency";
  owningResidencyId: string | null;
  exclusiveResidencyId: string | null;
  rosterStatus: "needs_review" | "ready";
  talentStatus: "active" | "inactive";
  archivedAt: Date | null;
  homeMarket: string;
  genres: string[];
  priority: number | null;
  talentNotes: string;
  paymentProfile: SyntheticPaymentProfile | null;
  hadProductionTaxDocument: boolean;
};

export type SyntheticPaymentProfile = {
  paymentMethod: string;
  zelleEmail: string;
  zellePhone: string;
  achAccountName: string;
  achRoutingNumber: string;
  achAccountNumber: string;
  lastFour: string;
};

export type StagingResidencyPlan = {
  sourceResidencyId: string;
  residencyId: string;
  clientAccountId: string;
  clientAccount: {
    name: string;
    active: boolean;
    internalNotes: string;
  };
  residency: Omit<SourceResidency, "id" | "clientAccountId"> & {
    primaryContactName: string;
    primaryContactPhone: string;
    primaryContactEmail: string;
    leadNotes: string;
    billingContactEmail: string;
    billingContactName: string;
    billingAddress: string;
    autoSendInvoices: false;
    autoSendReason: string;
    internalNotes: string;
  };
  dayparts: Array<Omit<SourceDaypart, "id" | "residencyId"> & { id: string }>;
  dayRules: Array<Omit<SourceDayRule, "id" | "daypartId"> & { id: string; daypartId: string }>;
  dateExceptions: Array<Omit<SourceDateException, "id" | "daypartId"> & { id: string; daypartId: string }>;
  talent: SanitizedTalent[];
  rosterAssignments: Array<{
    id: string;
    talentId: string;
    active: boolean;
    clientVisible: boolean;
  }>;
  report: StagingResidencySyncReport;
};

export type StagingResidencySyncReport = {
  residencyName: string;
  residencyWillBeCreated: boolean;
  daypartsToCreate: number;
  daypartsToRefresh: number;
  stagingOnlyDaypartsToDeactivate: number;
  dayRulesToSynchronize: number;
  dateExceptionsToSynchronize: number;
  artistsToCreate: number;
  artistsToRefresh: number;
  rosterAssignmentsToSynchronize: number;
  stagingOnlyRosterAssignmentsToDeactivate: number;
  syntheticPaymentProfiles: number;
  productionTaxDocumentsRead: 0;
  syntheticTaxPlaceholders: number;
  nonSelectedResidenciesTouched: 0;
};

function digest(value: string): Buffer {
  return createHash("sha256").update(`${SYNC_NAMESPACE}:${value}`).digest();
}

function shortToken(value: string, length = 10): string {
  return digest(value).toString("hex").slice(0, length);
}

export function stagingSyncUuid(entityType: string, productionId: string): string {
  const bytes = digest(`${entityType}:${productionId}`).subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function stagingSyncKey(productionTalentId: string): string {
  return `staging-sync-${shortToken(`talent-key:${productionTalentId}`, 24)}`;
}

export function supabaseProjectRefFromDatabaseUrl(databaseUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return null;
  }
  const directHost = parsed.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)?.[1];
  if (directHost) return directHost.toLowerCase();
  const username = decodeURIComponent(parsed.username);
  const pooledRef = username.match(/^[^.]+\.([a-z0-9]+)$/i)?.[1];
  return pooledRef?.toLowerCase() ?? null;
}

export function supabaseProjectRefFromApiUrl(apiUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(apiUrl);
  } catch {
    return null;
  }
  return parsed.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i)?.[1]?.toLowerCase() ?? null;
}

export function assertSafeSyncEnvironment(productionDatabaseUrl: string, stagingDatabaseUrl: string): void {
  const productionRef = supabaseProjectRefFromDatabaseUrl(productionDatabaseUrl);
  const stagingRef = supabaseProjectRefFromDatabaseUrl(stagingDatabaseUrl);
  if (productionRef !== PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error("PRODUCTION_SYNC_DATABASE_URL does not point to the approved HFY production project.");
  }
  if (stagingRef !== STAGING_SUPABASE_PROJECT_REF) {
    throw new Error("STAGING_SYNC_DATABASE_URL does not point to the approved HFY staging project.");
  }
  if (productionRef === stagingRef || productionDatabaseUrl === stagingDatabaseUrl) {
    throw new Error("Production and staging database connections must be different.");
  }
}

export function assertSafeSyncApiEnvironment(productionApiUrl: string, stagingDatabaseUrl: string): void {
  const productionRef = supabaseProjectRefFromApiUrl(productionApiUrl);
  const stagingRef = supabaseProjectRefFromDatabaseUrl(stagingDatabaseUrl);
  if (productionRef !== PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error("PRODUCTION_SYNC_SUPABASE_URL does not point to the approved HFY production project.");
  }
  if (stagingRef !== STAGING_SUPABASE_PROJECT_REF) {
    throw new Error("STAGING_SYNC_DATABASE_URL does not point to the approved HFY staging project.");
  }
  if (productionRef === stagingRef) {
    throw new Error("Production and staging projects must be different.");
  }
}

export function assertSafeStagingDestination(stagingDatabaseUrl: string): void {
  if (supabaseProjectRefFromDatabaseUrl(stagingDatabaseUrl) !== STAGING_SUPABASE_PROJECT_REF) {
    throw new Error("STAGING_SYNC_DATABASE_URL does not point to the approved HFY staging project.");
  }
}

const FIRST_NAMES = ["Jordan", "Casey", "Taylor", "Morgan", "Riley", "Avery", "Cameron", "Quinn"];
const LAST_NAMES = ["Rivera", "Bennett", "Hayes", "Monroe", "Parker", "Santos", "Brooks", "Ellis"];

function fakeIdentity(sourceTalentId: string, stageName: string) {
  const bytes = digest(`talent-identity:${sourceTalentId}`);
  const firstName = FIRST_NAMES[bytes[0]! % FIRST_NAMES.length]!;
  const lastName = LAST_NAMES[bytes[1]! % LAST_NAMES.length]!;
  const token = shortToken(`talent-contact:${sourceTalentId}`, 8);
  const phoneSuffix = String(100 + (bytes.readUInt16BE(2) % 100)).padStart(4, "0");
  const safeStageName = stageName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 18) || "artist";
  return {
    fullName: `${firstName} ${lastName}`,
    email: `${safeStageName}.${token}@example.invalid`,
    phone: `+1-202-555-${phoneSuffix}`,
    instagramHandle: `staging_${safeStageName}_${token.slice(0, 4)}`,
    token,
  };
}

export function sanitizeTalent(
  source: SourceTalent,
  sourceResidencyId: string,
  targetResidencyId: string,
): SanitizedTalent {
  const identity = fakeIdentity(source.id, source.stageName);
  const mapResidencyReference = (value: string | null, label: string) => {
    if (value === null) return null;
    if (value !== sourceResidencyId) {
      throw new Error(`${label} points outside the selected Residency; include that Residency in the same sync.`);
    }
    return targetResidencyId;
  };
  const accountSuffix = String(10_000_000 + (digest(`account:${source.id}`).readUInt32BE(0) % 90_000_000));
  const lastFour = accountSuffix.slice(-4);
  const paymentProfile = source.hasPaymentProfile ? {
    paymentMethod: source.paymentMethod || "ACH",
    zelleEmail: identity.email,
    zellePhone: identity.phone,
    achAccountName: identity.fullName,
    achRoutingNumber: "110000000",
    achAccountNumber: accountSuffix,
    lastFour,
  } : null;

  return {
    id: stagingSyncUuid("talent", source.id),
    stagingSyncKey: stagingSyncKey(source.id),
    stageName: source.stageName,
    fullName: identity.fullName,
    email: identity.email,
    phone: identity.phone,
    instagramHandle: identity.instagramHandle,
    clientContact: `${identity.fullName} <${identity.email}>`,
    ownership: source.ownership,
    owningResidencyId: mapResidencyReference(source.owningResidencyId, "Talent ownership"),
    exclusiveResidencyId: mapResidencyReference(source.exclusiveResidencyId, "Exclusive Talent assignment"),
    rosterStatus: source.rosterStatus,
    talentStatus: source.talentStatus,
    archivedAt: source.archivedAt,
    homeMarket: source.homeMarket,
    genres: [...source.genres],
    priority: source.priority,
    talentNotes: "Sanitized staging copy. No production contact, financial, tax, or private-note data is present.",
    paymentProfile,
    hadProductionTaxDocument: source.hasTaxDocument,
  };
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function buildStagingResidencyPlan(
  snapshot: ProductionStructureSnapshot,
  sourceResidencyId: string,
  target: ExistingStagingState,
): StagingResidencyPlan {
  const sourceResidency = snapshot.residencies.find((residency) => residency.id === sourceResidencyId);
  if (!sourceResidency) throw new Error("Selected production Residency was not found in the snapshot.");
  const sourceClientAccount = snapshot.clientAccounts.find((account) => account.id === sourceResidency.clientAccountId);
  if (!sourceClientAccount) throw new Error("Selected production Residency has no client account in the snapshot.");

  const residencyId = target.residencyId ?? stagingSyncUuid("residency", sourceResidency.id);
  const clientAccountId = target.clientAccountId && !target.clientAccountSharedWithOtherResidency
    ? target.clientAccountId
    : stagingSyncUuid("client-account", sourceClientAccount.id);
  const sourceDayparts = snapshot.dayparts.filter((daypart) => daypart.residencyId === sourceResidency.id);
  const existingDaypartsByName = new Map(target.dayparts.map((daypart) => [normalizeName(daypart.name), daypart]));
  const daypartIdMap = new Map<string, string>();
  const plannedDayparts = sourceDayparts.map((daypart) => {
    const deterministicId = stagingSyncUuid("daypart", daypart.id);
    const existing = target.dayparts.find((candidate) => candidate.id === deterministicId)
      ?? existingDaypartsByName.get(normalizeName(daypart.name));
    const id = existing?.id ?? deterministicId;
    daypartIdMap.set(daypart.id, id);
    return {
      id,
      name: daypart.name,
      room: daypart.room,
      color: daypart.color,
      type: daypart.type,
      billingMode: daypart.billingMode,
      scheduleMode: daypart.scheduleMode,
      suggestedStartMinute: daypart.suggestedStartMinute,
      suggestedEndMinute: daypart.suggestedEndMinute,
      defaultTalentRateCents: daypart.defaultTalentRateCents,
      clientDefaultRateCents: daypart.clientDefaultRateCents,
      activeUntil: daypart.activeUntil,
      active: daypart.active,
      sortOrder: daypart.sortOrder,
    };
  });

  const sourceDaypartIds = new Set(sourceDayparts.map((daypart) => daypart.id));
  const dayRules = snapshot.dayRules
    .filter((rule) => sourceDaypartIds.has(rule.daypartId))
    .map((rule) => {
      const mappedDaypartId = daypartIdMap.get(rule.daypartId);
      if (!mappedDaypartId) throw new Error("Day Rule could not be mapped to a staging Daypart.");
      return {
        id: stagingSyncUuid("day-rule", rule.id),
        daypartId: mappedDaypartId,
        weekday: rule.weekday,
        startMinute: rule.startMinute,
        endMinute: rule.endMinute,
        defaultDjCount: rule.defaultDjCount,
      };
    });
  const dateExceptions = snapshot.dateExceptions
    .filter((exception) => sourceDaypartIds.has(exception.daypartId))
    .map((exception) => {
      const mappedDaypartId = daypartIdMap.get(exception.daypartId);
      if (!mappedDaypartId) throw new Error("Date exception could not be mapped to a staging Daypart.");
      return {
        id: stagingSyncUuid("date-exception", exception.id),
        daypartId: mappedDaypartId,
        serviceDate: exception.serviceDate,
        kind: exception.kind,
        startMinute: exception.startMinute,
        endMinute: exception.endMinute,
      };
    });

  const sourceAssignments = snapshot.rosterAssignments.filter((assignment) => assignment.residencyId === sourceResidency.id);
  const assignedTalentIds = new Set(sourceAssignments.map((assignment) => assignment.talentId));
  const sourceTalent = snapshot.talent.filter((artist) => assignedTalentIds.has(artist.id));
  if (sourceTalent.length !== assignedTalentIds.size) throw new Error("At least one roster assignment has no matching Talent record.");
  const talent = sourceTalent.map((artist) => sanitizeTalent(artist, sourceResidency.id, residencyId));
  const talentIdMap = new Map(sourceTalent.map((artist, index) => [artist.id, talent[index]!.id]));
  const rosterAssignments = sourceAssignments.map((assignment) => ({
    id: stagingSyncUuid("residency-talent", `${assignment.residencyId}:${assignment.talentId}`),
    talentId: talentIdMap.get(assignment.talentId)!,
    active: assignment.active,
    clientVisible: assignment.clientVisible,
  }));

  const expectedTalentKeys = new Map(talent.map((artist) => [artist.id, artist.stagingSyncKey]));
  for (const existingTalent of target.talent) {
    const expectedKey = expectedTalentKeys.get(existingTalent.id);
    if (expectedKey && existingTalent.airtableRecordId !== expectedKey) {
      throw new Error("A deterministic staging Talent ID is already occupied by a non-sync record.");
    }
  }

  const sourceDaypartTargetIds = new Set(plannedDayparts.map((daypart) => daypart.id));
  const sourceTalentTargetIds = new Set(talent.map((artist) => artist.id));
  const contactToken = shortToken(`residency-contact:${sourceResidency.id}`, 8);
  const contactPhoneSuffix = String(100 + (digest(`residency-phone:${sourceResidency.id}`).readUInt16BE(0) % 100)).padStart(4, "0");
  const safeResidencySlug = sourceResidency.slug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const targetTalentIds = new Set(target.talent.map((artist) => artist.id));

  return {
    sourceResidencyId: sourceResidency.id,
    residencyId,
    clientAccountId,
    clientAccount: {
      name: sourceClientAccount.name,
      active: sourceClientAccount.active,
      internalNotes: "Sanitized production-structure copy for staging. Production notes were not read.",
    },
    residency: {
      slug: sourceResidency.slug,
      name: sourceResidency.name,
      cityState: sourceResidency.cityState,
      timezone: sourceResidency.timezone,
      tier: sourceResidency.tier,
      operatingMode: sourceResidency.operatingMode,
      active: sourceResidency.active,
      primaryContactName: `${sourceResidency.name} Staging Contact`,
      primaryContactPhone: `+1-202-555-${contactPhoneSuffix}`,
      primaryContactEmail: `${safeResidencySlug}.${contactToken}@example.invalid`,
      leadSource: sourceResidency.leadSource,
      pipelineStatus: sourceResidency.pipelineStatus,
      pipelineStatusChangedAt: sourceResidency.pipelineStatusChangedAt,
      leadNotes: "",
      convertedAt: sourceResidency.convertedAt,
      defaultTalentRateCents: sourceResidency.defaultTalentRateCents,
      clientHourlyRateCents: sourceResidency.clientHourlyRateCents,
      paymentTermsDays: sourceResidency.paymentTermsDays,
      invoiceFrequency: sourceResidency.invoiceFrequency,
      billingCycleStartWeekday: sourceResidency.billingCycleStartWeekday,
      billingCycleLengthDays: sourceResidency.billingCycleLengthDays,
      invoiceLinePresentation: sourceResidency.invoiceLinePresentation,
      defaultInvoiceNote: sourceResidency.defaultInvoiceNote,
      schedulingPattern: sourceResidency.schedulingPattern,
      billingContactEmail: `${safeResidencySlug}.billing.${contactToken}@example.invalid`,
      billingContactName: `${sourceResidency.name} Staging Billing`,
      billingAddress: `100 Test Data Way\n${sourceResidency.cityState || "Test Market"}`,
      invoicePrefix: sourceResidency.invoicePrefix,
      autoSendInvoices: false,
      autoSendReason: "Disabled in staging by the production-structure sync.",
      clientPaymentStatusVisible: sourceResidency.clientPaymentStatusVisible,
      internalNotes: "Sanitized production-structure copy for staging. No production contacts, memberships, tokens, or private notes were copied.",
    },
    dayparts: plannedDayparts,
    dayRules,
    dateExceptions,
    talent,
    rosterAssignments,
    report: {
      residencyName: sourceResidency.name,
      residencyWillBeCreated: target.residencyId === null,
      daypartsToCreate: plannedDayparts.filter((daypart) => !target.dayparts.some((candidate) => candidate.id === daypart.id)).length,
      daypartsToRefresh: plannedDayparts.filter((daypart) => target.dayparts.some((candidate) => candidate.id === daypart.id)).length,
      stagingOnlyDaypartsToDeactivate: target.dayparts.filter((daypart) => daypart.active && !sourceDaypartTargetIds.has(daypart.id)).length,
      dayRulesToSynchronize: dayRules.length,
      dateExceptionsToSynchronize: dateExceptions.length,
      artistsToCreate: talent.filter((artist) => !targetTalentIds.has(artist.id)).length,
      artistsToRefresh: talent.filter((artist) => targetTalentIds.has(artist.id)).length,
      rosterAssignmentsToSynchronize: rosterAssignments.length,
      stagingOnlyRosterAssignmentsToDeactivate: target.rosterAssignments.filter((assignment) => assignment.active && !sourceTalentTargetIds.has(assignment.talentId)).length,
      syntheticPaymentProfiles: talent.filter((artist) => artist.paymentProfile !== null).length,
      productionTaxDocumentsRead: 0,
      syntheticTaxPlaceholders: 0,
      nonSelectedResidenciesTouched: 0,
    },
  };
}

export function formatDryRunReport(plans: StagingResidencyPlan[], apply: boolean): string {
  const totals = plans.reduce((result, plan) => ({
    dayparts: result.dayparts + plan.dayparts.length,
    dayRules: result.dayRules + plan.dayRules.length,
    dateExceptions: result.dateExceptions + plan.dateExceptions.length,
    artists: result.artists + plan.talent.length,
    assignments: result.assignments + plan.rosterAssignments.length,
    payments: result.payments + plan.report.syntheticPaymentProfiles,
    taxDocuments: result.taxDocuments + plan.talent.filter((artist) => artist.hadProductionTaxDocument).length,
    deactivatedDayparts: result.deactivatedDayparts + plan.report.stagingOnlyDaypartsToDeactivate,
    deactivatedAssignments: result.deactivatedAssignments + plan.report.stagingOnlyRosterAssignmentsToDeactivate,
  }), { dayparts: 0, dayRules: 0, dateExceptions: 0, artists: 0, assignments: 0, payments: 0, taxDocuments: 0, deactivatedDayparts: 0, deactivatedAssignments: 0 });
  const scope = plans.map((plan) => plan.report.residencyName).join(", ");
  return [
    "Production → staging structural sync",
    `Mode: ${apply ? "APPLY" : "DRY RUN — no staging writes"}`,
    `Scope: ${scope}`,
    "Environment guard: approved production source → approved staging destination",
    "",
    "Source structure selected:",
    `  Residencies: ${plans.length}`,
    `  Dayparts: ${totals.dayparts}`,
    `  Weekly Day Rules: ${totals.dayRules}`,
    `  Single-date exceptions: ${totals.dateExceptions}`,
    `  Assigned artists: ${totals.artists}`,
    `  Roster assignments: ${totals.assignments}`,
    "",
    "Staging changes:",
    `  Staging-only Dayparts to deactivate inside this scope: ${totals.deactivatedDayparts}`,
    `  Staging-only roster assignments to deactivate inside this scope: ${totals.deactivatedAssignments}`,
    `  Synthetic payment profiles: ${totals.payments}`,
    `  Production W-9/tax files detected by presence only: ${totals.taxDocuments}`,
    "  Production W-9/tax files read or downloaded: 0",
    "  Authentication users, memberships, setup tokens, shifts, bookings, payouts, invoices, and public share tokens copied: 0",
    "  Non-selected staging Residencies touched: 0",
    "",
    "Sanitization boundary:",
    "  Production artist/residency contact fields selected by the source queries: 0",
    "  Production ACH, Zelle, tax-document paths, private notes, and legacy financial values selected by the source queries: 0",
    "  Staging delivery safety: invoice auto-send forced off; no production delivery endpoint is copied",
    ...(apply ? ["", "Staging transaction committed."] : ["", "Dry run complete. Re-run with --apply only after reviewing this report."]),
  ].join("\n");
}
