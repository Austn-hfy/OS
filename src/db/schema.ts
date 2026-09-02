import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { InvoiceDocumentSnapshot } from "@/domain/invoice-document";

export const userRole = pgEnum("user_role", ["internal_admin", "hotel_user"]);
export const residencyAccessRole = pgEnum("residency_access_role", ["manager", "calendar_viewer"]);
export const invitationStatus = pgEnum("invitation_status", ["not_invited", "invited", "active", "revoked"]);
export const serviceTier = pgEnum("service_tier", ["operations_only", "complete"]);
export const operatingMode = pgEnum("operating_mode", ["pipeline", "operations"]);
export const leadSource = pgEnum("lead_source", ["inbound", "outbound"]);
export const pipelineStatus = pgEnum("pipeline_status", [
  "contacted",
  "call_scheduled",
  "call_complete",
  "discovery_scheduled",
  "discovery_complete",
  "proposal_sent",
  "won",
  "lost",
]);
export const rosterStatus = pgEnum("roster_status", ["needs_review", "ready"]);
export const talentStatus = pgEnum("talent_status", ["active", "inactive"]);
export const bookingStatus = pgEnum("booking_status", [
  "open",
  "offered",
  "pending_hfy_confirmation",
  "confirmed",
  "completed",
  "cancelled",
]);
export const compensationType = pgEnum("compensation_type", ["hourly", "fixed", "na"]);
export const payoutStatus = pgEnum("payout_status", ["not_ready", "ready_to_pay", "paid", "na"]);
export const billingStatus = pgEnum("billing_status", ["pending", "reviewed", "invoiced", "not_billable"]);
export const invoiceStatus = pgEnum("invoice_status", ["draft", "approved", "sent", "paid", "void"]);
export const deliveryStatus = pgEnum("delivery_status", ["pending", "sent", "failed"]);
export const invoiceKind = pgEnum("invoice_kind", ["scheduled_period", "custom"]);
export const invoiceLinePresentation = pgEnum("invoice_line_presentation", ["service_detail", "daily_summary", "period_summary"]);
export const invoiceLineType = pgEnum("invoice_line_type", [
  "program_base_fee",
  "overage",
  "trial_add_on",
  "talent_hours",
  "talent_fixed_fee",
  "manual_adjustment",
  "special_event",
]);
export const attentionStatus = pgEnum("attention_status", ["open", "resolved"]);
export const automationStatus = pgEnum("automation_status", ["running", "succeeded", "failed", "skipped"]);
export const daypartType = pgEnum("daypart_type", ["dj_artist", "house_activity"]);
export const daypartBillingMode = pgEnum("daypart_billing_mode", ["billed_by_hfy", "tracking_only"]);
export const daypartDateExceptionKind = pgEnum("daypart_date_exception_kind", ["skip", "override"]);
export const talentOwnership = pgEnum("talent_ownership", ["hfy", "residency"]);
export const shiftEconomicsMode = pgEnum("shift_economics_mode", ["hfy", "client_owned", "hfy_request"]);
export const hfyTalentRequestStatus = pgEnum("hfy_talent_request_status", ["pending", "fulfilled", "cancelled"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  role: userRole("role").notNull(),
  isInternalTest: boolean("is_internal_test").notNull().default(false),
  active: boolean("active").notNull().default(true),
  ...timestamps,
}, (table) => [
  uniqueIndex("users_email_unique").on(sql`lower(${table.email})`),
  check("users_internal_test_role_valid", sql`NOT ${table.isInternalTest} OR ${table.role} = 'hotel_user'`),
]);

export const platformSettings = pgTable("platform_settings", {
  id: uuid("id").primaryKey(),
  companyName: text("company_name").notNull().default("Hear For You"),
  billingEmail: text("billing_email").notNull().default("billing@hearforyou.group"),
  billingAddress: text("billing_address").notNull().default(""),
  invoiceLogoStoragePath: text("invoice_logo_storage_path"),
  invoiceLogoContentType: text("invoice_logo_content_type"),
  invoiceLogoSha256: text("invoice_logo_sha256"),
  invoiceLogoByteSize: integer("invoice_logo_byte_size"),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
}, (table) => [
  check("platform_settings_logo_metadata_complete", sql`
    (${table.invoiceLogoStoragePath} IS NULL AND ${table.invoiceLogoContentType} IS NULL AND ${table.invoiceLogoSha256} IS NULL AND ${table.invoiceLogoByteSize} IS NULL)
    OR
    (${table.invoiceLogoStoragePath} IS NOT NULL AND ${table.invoiceLogoContentType} IN ('image/png', 'image/jpeg', 'image/webp') AND ${table.invoiceLogoSha256} IS NOT NULL AND ${table.invoiceLogoByteSize} > 0)
  `),
]);

export const clientAccounts = pgTable("client_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  internalNotes: text("internal_notes").notNull().default(""),
  ...timestamps,
});

export const residencies = pgTable("residencies", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientAccountId: uuid("client_account_id").notNull().references(() => clientAccounts.id, { onDelete: "restrict" }),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  cityState: text("city_state").notNull().default(""),
  timezone: text("timezone").notNull().default("America/Los_Angeles"),
  tier: serviceTier("tier").notNull().default("operations_only"),
  operatingMode: operatingMode("operating_mode").notNull().default("operations"),
  active: boolean("active").notNull().default(true),
  primaryContactName: text("primary_contact_name").notNull().default(""),
  primaryContactPhone: text("primary_contact_phone").notNull().default(""),
  primaryContactEmail: text("primary_contact_email").notNull().default(""),
  leadSource: leadSource("lead_source"),
  pipelineStatus: pipelineStatus("pipeline_status").notNull().default("contacted"),
  pipelineStatusChangedAt: timestamp("pipeline_status_changed_at", { withTimezone: true }).notNull().defaultNow(),
  leadNotes: text("lead_notes").notNull().default(""),
  convertedAt: timestamp("converted_at", { withTimezone: true }),
  defaultTalentRateCents: integer("default_talent_rate_cents").notNull().default(0),
  clientHourlyRateCents: integer("client_hourly_rate_cents").notNull().default(0),
  paymentTermsDays: integer("payment_terms_days").notNull().default(7),
  invoiceFrequency: text("invoice_frequency").notNull().default("weekly"),
  billingCycleStartWeekday: integer("billing_cycle_start_weekday").notNull().default(1),
  billingCycleLengthDays: integer("billing_cycle_length_days").notNull().default(7),
  invoiceLinePresentation: invoiceLinePresentation("invoice_line_presentation").notNull().default("service_detail"),
  defaultInvoiceNote: text("default_invoice_note").notNull().default(""),
  schedulingPattern: text("scheduling_pattern").notNull().default("client_supplied"),
  billingContactEmail: text("billing_contact_email").notNull().default(""),
  billingContactName: text("billing_contact_name").notNull().default(""),
  billingAddress: text("billing_address").notNull().default(""),
  invoicePrefix: text("invoice_prefix").notNull(),
  autoSendInvoices: boolean("auto_send_invoices").notNull().default(false),
  autoSendReason: text("auto_send_reason").notNull().default(""),
  clientPaymentStatusVisible: boolean("client_payment_status_visible").notNull().default(true),
  internalNotes: text("internal_notes").notNull().default(""),
  ...timestamps,
}, (table) => [
  uniqueIndex("residencies_slug_unique").on(table.slug),
  uniqueIndex("residencies_invoice_prefix_unique").on(table.invoicePrefix),
  index("residencies_client_account_idx").on(table.clientAccountId),
  index("residencies_pipeline_status_idx").on(table.operatingMode, table.pipelineStatus, table.pipelineStatusChangedAt),
  check("residencies_rates_nonnegative", sql`${table.defaultTalentRateCents} >= 0 AND ${table.clientHourlyRateCents} >= 0`),
  check("residencies_payment_terms_valid", sql`${table.paymentTermsDays} >= 0 AND ${table.paymentTermsDays} <= 365`),
  check("residencies_billing_cycle_valid", sql`${table.billingCycleStartWeekday} >= 0 AND ${table.billingCycleStartWeekday} <= 6 AND ${table.billingCycleLengthDays} >= 1 AND ${table.billingCycleLengthDays} <= 31`),
]);

export const publicCalendarLinks = pgTable("public_calendar_links", {
  residencyId: uuid("residency_id").primaryKey().references(() => residencies.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  scope: text("scope").$type<"all" | "selected">().notNull().default("all"),
  rotatedByUserId: uuid("rotated_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("public_calendar_links_token_hash_unique").on(table.tokenHash),
  check("public_calendar_links_token_hash_valid", sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
  check("public_calendar_links_scope_valid", sql`${table.scope} IN ('all', 'selected')`),
]);

export const dayparts = pgTable("dayparts", {
  id: uuid("id").primaryKey().defaultRandom(),
  residencyId: uuid("residency_id").notNull().references(() => residencies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  room: text("room").notNull(),
  color: text("color").notNull().default("#2783DC"),
  type: daypartType("type").notNull().default("dj_artist"),
  billingMode: daypartBillingMode("billing_mode").default("billed_by_hfy"),
  defaultTalentRateCents: integer("default_talent_rate_cents"),
  activeUntil: date("active_until", { mode: "string" }),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
}, (table) => [
  uniqueIndex("dayparts_residency_name_unique").on(table.residencyId, sql`lower(${table.name})`),
  index("dayparts_residency_active_idx").on(table.residencyId, table.active, table.sortOrder),
  check("dayparts_color_valid", sql`${table.color} ~ '^#[0-9A-Fa-f]{6}$'`),
  check("dayparts_rate_nonnegative", sql`${table.defaultTalentRateCents} IS NULL OR ${table.defaultTalentRateCents} >= 0`),
  check("dayparts_type_fields_valid", sql`
    (${table.type} = 'house_activity' AND ${table.billingMode} IS NULL AND ${table.defaultTalentRateCents} IS NULL)
    OR
    (${table.type} = 'dj_artist' AND ${table.billingMode} = 'tracking_only' AND ${table.defaultTalentRateCents} IS NULL)
    OR
    (${table.type} = 'dj_artist' AND ${table.billingMode} = 'billed_by_hfy')
  `),
]);

export const publicCalendarLinkDayparts = pgTable("public_calendar_link_dayparts", {
  residencyId: uuid("residency_id").notNull().references(() => publicCalendarLinks.residencyId, { onDelete: "cascade" }),
  daypartId: uuid("daypart_id").notNull().references(() => dayparts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.residencyId, table.daypartId] }),
  index("public_calendar_link_dayparts_daypart_idx").on(table.daypartId),
]);

export const daypartDayRules = pgTable("daypart_day_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  daypartId: uuid("daypart_id").notNull().references(() => dayparts.id, { onDelete: "cascade" }),
  weekday: integer("weekday").notNull(),
  startMinute: integer("start_minute").notNull(),
  endMinute: integer("end_minute").notNull(),
  defaultDjCount: integer("default_dj_count"),
  ...timestamps,
}, (table) => [
  uniqueIndex("daypart_day_rules_daypart_weekday_unique").on(table.daypartId, table.weekday),
  index("daypart_day_rules_weekday_idx").on(table.weekday, table.daypartId),
  check("daypart_day_rules_weekday_valid", sql`${table.weekday} >= 0 AND ${table.weekday} <= 6`),
  check("daypart_day_rules_start_valid", sql`${table.startMinute} >= 0 AND ${table.startMinute} < 1440`),
  check("daypart_day_rules_end_valid", sql`${table.endMinute} > ${table.startMinute} AND ${table.endMinute} <= ${table.startMinute} + 1440`),
  check("daypart_day_rules_dj_count_valid", sql`${table.defaultDjCount} IS NULL OR (${table.defaultDjCount} > 0 AND ${table.defaultDjCount} <= 20)`),
]);

export const daypartDateExceptions = pgTable("daypart_date_exceptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  daypartId: uuid("daypart_id").notNull().references(() => dayparts.id, { onDelete: "cascade" }),
  serviceDate: date("service_date", { mode: "string" }).notNull(),
  kind: daypartDateExceptionKind("kind").notNull(),
  startMinute: integer("start_minute"),
  endMinute: integer("end_minute"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
}, (table) => [
  uniqueIndex("daypart_date_exceptions_daypart_date_unique").on(table.daypartId, table.serviceDate),
  index("daypart_date_exceptions_date_idx").on(table.serviceDate, table.daypartId),
  check("daypart_date_exceptions_fields_valid", sql`
    (${table.kind} = 'skip' AND ${table.startMinute} IS NULL AND ${table.endMinute} IS NULL)
    OR
    (${table.kind} = 'override' AND ${table.startMinute} >= 0 AND ${table.startMinute} < 1440 AND ${table.endMinute} > ${table.startMinute} AND ${table.endMinute} <= ${table.startMinute} + 1440)
  `),
]);

export const scheduleOccurrences = pgTable("schedule_occurrences", {
  id: uuid("id").primaryKey().defaultRandom(),
  residencyId: uuid("residency_id").notNull().references(() => residencies.id, { onDelete: "cascade" }),
  daypartId: uuid("daypart_id").references(() => dayparts.id, { onDelete: "restrict" }),
  serviceDate: date("service_date", { mode: "string" }).notNull(),
  name: text("name").notNull(),
  room: text("room").notNull(),
  color: text("color").notNull(),
  type: daypartType("type").notNull(),
  notes: text("notes").notNull().default(""),
  programDetails: text("program_details").notNull().default(""),
  manualHostName: text("manual_host_name").notNull().default(""),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
}, (table) => [
  uniqueIndex("schedule_occurrences_daypart_date_unique").on(table.daypartId, table.serviceDate),
  index("schedule_occurrences_residency_date_idx").on(table.residencyId, table.serviceDate),
  check("schedule_occurrences_time_valid", sql`${table.endsAt} > ${table.startsAt}`),
  check("schedule_occurrences_color_valid", sql`${table.color} ~ '^#[0-9A-Fa-f]{6}$'`),
]);

export const scheduleOccurrenceTalent = pgTable("schedule_occurrence_talent", {
  id: uuid("id").primaryKey().defaultRandom(),
  occurrenceId: uuid("occurrence_id").notNull().references(() => scheduleOccurrences.id, { onDelete: "cascade" }),
  talentId: uuid("talent_id").notNull().references(() => talent.id, { onDelete: "restrict" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("schedule_occurrence_talent_occurrence_idx").on(table.occurrenceId),
  index("schedule_occurrence_talent_talent_time_idx").on(table.talentId, table.startsAt, table.endsAt),
  uniqueIndex("schedule_occurrence_talent_unique").on(table.occurrenceId, table.talentId, table.startsAt),
  check("schedule_occurrence_talent_time_valid", sql`${table.endsAt} > ${table.startsAt}`),
]);

export const residencyMemberships = pgTable("residency_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  residencyId: uuid("residency_id").notNull().references(() => residencies.id, { onDelete: "cascade" }),
  accessRole: residencyAccessRole("access_role").notNull().default("manager"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("residency_memberships_user_residency_unique").on(table.userId, table.residencyId),
  index("residency_memberships_residency_idx").on(table.residencyId),
]);

export const residencyContacts = pgTable("residency_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  residencyId: uuid("residency_id").notNull().references(() => residencies.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  title: text("title").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  accessRole: residencyAccessRole("access_role"),
  invitationStatus: invitationStatus("invitation_status").notNull().default("not_invited"),
  isPrimary: boolean("is_primary").notNull().default(false),
  active: boolean("active").notNull().default(true),
  invitedAt: timestamp("invited_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  index("residency_contacts_residency_idx").on(table.residencyId, table.active),
  uniqueIndex("residency_contacts_residency_email_unique")
    .on(table.residencyId, sql`lower(${table.email})`)
    .where(sql`${table.email} <> ''`),
]);

export const accountSetupTokens = pgTable("account_setup_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  residencyId: uuid("residency_id").references(() => residencies.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => residencyContacts.id, { onDelete: "set null" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("account_setup_tokens_hash_unique").on(table.tokenHash),
  uniqueIndex("account_setup_tokens_one_active_per_user")
    .on(table.userId)
    .where(sql`${table.usedAt} IS NULL AND ${table.revokedAt} IS NULL`),
  index("account_setup_tokens_user_idx").on(table.userId, table.createdAt),
  check("account_setup_tokens_hash_valid", sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
  check("account_setup_tokens_expiry_valid", sql`${table.expiresAt} > ${table.createdAt}`),
  check("account_setup_tokens_terminal_state_valid", sql`NOT (${table.usedAt} IS NOT NULL AND ${table.revokedAt} IS NOT NULL)`),
]);

export const talent = pgTable("talent", {
  id: uuid("id").primaryKey().defaultRandom(),
  airtableRecordId: text("airtable_record_id"),
  stageName: text("stage_name").notNull(),
  fullName: text("full_name").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  instagramHandle: text("instagram_handle").notNull().default(""),
  clientContact: text("client_contact").notNull().default(""),
  ownership: talentOwnership("ownership").notNull().default("hfy"),
  owningResidencyId: uuid("owning_residency_id").references(() => residencies.id, { onDelete: "cascade" }),
  exclusiveResidencyId: uuid("exclusive_residency_id").references(() => residencies.id, { onDelete: "set null" }),
  rosterStatus: rosterStatus("roster_status").notNull().default("needs_review"),
  talentStatus: talentStatus("talent_status").notNull().default("active"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  homeMarket: text("home_market").notNull().default(""),
  genres: text("genres").array().notNull().default(sql`ARRAY['Electronic/House']::text[]`),
  priority: integer("priority"),
  talentNotes: text("talent_notes").notNull().default(""),
  legacyOutstandingOwedCents: integer("legacy_outstanding_owed_cents").notNull().default(0),
  legacyTotalEarningsCents: integer("legacy_total_earnings_cents").notNull().default(0),
  legacyOwedFrom: text("legacy_owed_from").notNull().default(""),
  legacyUpcomingBookings: text("legacy_upcoming_bookings").notNull().default(""),
  airtableRosterStatusLabel: text("airtable_roster_status_label").notNull().default(""),
  airtableTalentStatusLabel: text("airtable_talent_status_label").notNull().default(""),
  airtableImportedAt: timestamp("airtable_imported_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("talent_airtable_record_id_unique").on(table.airtableRecordId),
  index("talent_stage_name_idx").on(table.stageName),
  index("talent_owning_residency_idx").on(table.owningResidencyId, table.archivedAt),
  index("talent_exclusive_residency_idx").on(table.exclusiveResidencyId),
  index("talent_visibility_idx").on(table.archivedAt, table.talentStatus),
  check("talent_legacy_financials_nonnegative", sql`${table.legacyOutstandingOwedCents} >= 0 AND ${table.legacyTotalEarningsCents} >= 0`),
  check("talent_priority_range", sql`${table.priority} IS NULL OR (${table.priority} >= 1 AND ${table.priority} <= 5)`),
  check("talent_genres_standardized", sql`cardinality(${table.genres}) BETWEEN 1 AND 3 AND ${table.genres} <@ ARRAY['Electronic/House', 'Open Format', 'Vinyl']::text[]`),
  check("talent_ownership_valid", sql`
    (${table.ownership} = 'hfy' AND ${table.owningResidencyId} IS NULL)
    OR
    (${table.ownership} = 'residency' AND ${table.owningResidencyId} IS NOT NULL AND ${table.exclusiveResidencyId} = ${table.owningResidencyId})
  `),
]);

export const talentOnboardingSubmissions = pgTable("talent_onboarding_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  stageName: text("stage_name").notNull(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull().default(""),
  instagramHandle: text("instagram_handle").notNull().default(""),
  homeMarket: text("home_market").notNull().default(""),
  genres: text("genres").array().notNull().default(sql`ARRAY['Electronic/House']::text[]`),
  notes: text("notes").notNull().default(""),
  w9StoragePath: text("w9_storage_path"),
  status: rosterStatus("status").notNull().default("needs_review"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
}, (table) => [
  check("talent_onboarding_genres_standardized", sql`cardinality(${table.genres}) BETWEEN 1 AND 3 AND ${table.genres} <@ ARRAY['Electronic/House', 'Open Format', 'Vinyl']::text[]`),
]);

export const talentDocuments = pgTable("talent_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  talentId: uuid("talent_id").notNull().references(() => talent.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  storagePath: text("storage_path").notNull(),
  contentType: text("content_type").notNull(),
  uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("talent_documents_storage_path_unique").on(table.storagePath)]);

export const talentPaymentProfiles = pgTable("talent_payment_profiles", {
  talentId: uuid("talent_id").primaryKey().references(() => talent.id, { onDelete: "cascade" }),
  paymentMethod: text("payment_method").notNull().default(""),
  zelleEmail: text("zelle_email").notNull().default(""),
  zellePhone: text("zelle_phone").notNull().default(""),
  achAccountNameEncrypted: text("ach_account_name_encrypted").notNull().default(""),
  achRoutingNumberEncrypted: text("ach_routing_number_encrypted").notNull().default(""),
  achAccountNumberEncrypted: text("ach_account_number_encrypted").notNull().default(""),
  lastFour: text("last_four").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const residencyTalent = pgTable("residency_talent", {
  id: uuid("id").primaryKey().defaultRandom(),
  residencyId: uuid("residency_id").notNull().references(() => residencies.id, { onDelete: "cascade" }),
  talentId: uuid("talent_id").notNull().references(() => talent.id, { onDelete: "cascade" }),
  active: boolean("active").notNull().default(true),
  approvedByUserId: uuid("approved_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("residency_talent_residency_talent_unique").on(table.residencyId, table.talentId),
  index("residency_talent_talent_idx").on(table.talentId),
]);

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  residencyId: uuid("residency_id").notNull().references(() => residencies.id, { onDelete: "restrict" }),
  invoiceNumber: text("invoice_number").notNull(),
  billingPeriodStart: date("billing_period_start", { mode: "string" }).notNull(),
  billingPeriodEnd: date("billing_period_end", { mode: "string" }).notNull(),
  invoiceDate: date("invoice_date", { mode: "string" }).notNull(),
  paymentTermsDays: integer("payment_terms_days").notNull(),
  kind: invoiceKind("kind").notNull().default("scheduled_period"),
  status: invoiceStatus("status").notNull().default("draft"),
  version: integer("version").notNull().default(1),
  totalCents: integer("total_cents").notNull().default(0),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  pdfStoragePath: text("pdf_storage_path"),
  pdfSourceHash: text("pdf_source_hash"),
  pdfSha256: text("pdf_sha256"),
  pdfGeneratedAt: timestamp("pdf_generated_at", { withTimezone: true }),
  pdfGeneratedByUserId: uuid("pdf_generated_by_user_id").references(() => users.id, { onDelete: "set null" }),
  pdfByteSize: integer("pdf_byte_size"),
  pdfSnapshot: jsonb("pdf_snapshot").$type<InvoiceDocumentSnapshot>(),
  notes: text("notes").notNull().default(""),
  ...timestamps,
}, (table) => [
  uniqueIndex("invoices_residency_number_unique").on(table.residencyId, table.invoiceNumber),
  index("invoices_residency_period_idx").on(table.residencyId, table.billingPeriodStart, table.billingPeriodEnd),
  check("invoices_period_valid", sql`${table.billingPeriodEnd} >= ${table.billingPeriodStart}`),
  check("invoices_terms_valid", sql`${table.paymentTermsDays} >= 0 AND ${table.paymentTermsDays} <= 365`),
  check("invoices_total_nonnegative", sql`${table.totalCents} >= 0`),
  check("invoices_version_positive", sql`${table.version} > 0`),
  check("invoices_pdf_size_positive", sql`${table.pdfByteSize} IS NULL OR ${table.pdfByteSize} > 0`),
  check("invoices_approved_has_pdf", sql`${table.status} NOT IN ('approved', 'sent', 'paid') OR ${table.pdfStoragePath} IS NOT NULL`),
  check("invoices_paid_has_date", sql`${table.status} <> 'paid' OR ${table.paidAt} IS NOT NULL`),
]);

export const shifts = pgTable("shifts", {
  id: uuid("id").primaryKey().defaultRandom(),
  residencyId: uuid("residency_id").notNull().references(() => residencies.id, { onDelete: "restrict" }),
  daypartId: uuid("daypart_id").references(() => dayparts.id, { onDelete: "set null" }),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  serviceDate: date("service_date", { mode: "string" }).notNull(),
  room: text("room").notNull(),
  calendarColor: text("calendar_color"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  notes: text("notes").notNull().default(""),
  programDetails: text("program_details").notNull().default(""),
  manualHostName: text("manual_host_name").notNull().default(""),
  economicsMode: shiftEconomicsMode("economics_mode").notNull().default("hfy"),
  clientRateOverrideCents: integer("client_rate_override_cents"),
  clientRateCents: integer("client_rate_cents").notNull(),
  billingStatus: billingStatus("billing_status").notNull().default("pending"),
  invoiceLinkIssue: boolean("invoice_link_issue").notNull().default(false),
  invoiceLinkNote: text("invoice_link_note").notNull().default(""),
  ...timestamps,
}, (table) => [
  index("shifts_residency_date_idx").on(table.residencyId, table.serviceDate),
  index("shifts_daypart_idx").on(table.daypartId, table.serviceDate),
  uniqueIndex("shifts_exact_slot_unique").on(table.residencyId, table.room, table.startsAt, table.endsAt),
  uniqueIndex("shifts_daypart_date_unique").on(table.daypartId, table.serviceDate).where(sql`${table.daypartId} IS NOT NULL`),
  check("shifts_time_valid", sql`${table.endsAt} > ${table.startsAt}`),
  check("shifts_calendar_color_valid", sql`${table.calendarColor} IS NULL OR ${table.calendarColor} ~ '^#[0-9A-Fa-f]{6}$'`),
  check("shifts_client_rate_nonnegative", sql`${table.clientRateCents} >= 0 AND (${table.clientRateOverrideCents} IS NULL OR ${table.clientRateOverrideCents} >= 0)`),
  check("shifts_economics_boundary", sql`
    ${table.economicsMode} = 'hfy'
    OR
    (${table.invoiceId} IS NULL AND ${table.billingStatus} = 'not_billable' AND ${table.clientRateOverrideCents} IS NULL AND ${table.clientRateCents} = 0)
  `),
]);

export const assignments = pgTable("assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  shiftId: uuid("shift_id").notNull().references(() => shifts.id, { onDelete: "restrict" }),
  talentId: uuid("talent_id").references(() => talent.id, { onDelete: "restrict" }),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  source: text("source").notNull().default("internal"),
  setName: text("set_name").notNull(),
  guestName: text("guest_name").notNull().default(""),
  role: text("role").notNull().default("DJ"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  bookingStatus: bookingStatus("booking_status").notNull().default("open"),
  compensationType: compensationType("compensation_type").notNull().default("hourly"),
  talentRateOverrideCents: integer("talent_rate_override_cents"),
  talentRateCents: integer("talent_rate_cents").notNull().default(0),
  fixedFeeCents: integer("fixed_fee_cents"),
  totalCompensationCents: integer("total_compensation_cents").notNull().default(0),
  payoutStatus: payoutStatus("payout_status").notNull().default("not_ready"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  paidAmountCents: integer("paid_amount_cents"),
  paymentReference: text("payment_reference"),
  internalNotes: text("internal_notes").notNull().default(""),
  ...timestamps,
}, (table) => [
  index("assignments_shift_idx").on(table.shiftId),
  index("assignments_talent_time_idx").on(table.talentId, table.startsAt, table.endsAt),
  index("assignments_booking_payout_idx").on(table.bookingStatus, table.payoutStatus),
  check("assignments_time_valid", sql`${table.endsAt} > ${table.startsAt}`),
  check("assignments_money_nonnegative", sql`${table.talentRateCents} >= 0 AND (${table.talentRateOverrideCents} IS NULL OR ${table.talentRateOverrideCents} >= 0) AND ${table.totalCompensationCents} >= 0 AND (${table.fixedFeeCents} IS NULL OR ${table.fixedFeeCents} >= 0) AND (${table.paidAmountCents} IS NULL OR ${table.paidAmountCents} >= 0)`),
  check("assignments_na_payout_consistent", sql`${table.compensationType} <> 'na' OR (${table.payoutStatus} = 'na' AND ${table.totalCompensationCents} = 0)`),
  check("assignments_paid_complete", sql`${table.payoutStatus} <> 'paid' OR (${table.paidAt} IS NOT NULL AND ${table.paidAmountCents} IS NOT NULL AND ${table.paymentReference} IS NOT NULL)`),
]);

export const clientAssignmentTerms = pgTable("client_assignment_terms", {
  assignmentId: uuid("assignment_id").primaryKey().references(() => assignments.id, { onDelete: "cascade" }),
  residencyId: uuid("residency_id").notNull().references(() => residencies.id, { onDelete: "cascade" }),
  rateCents: integer("rate_cents"),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
}, (table) => [
  index("client_assignment_terms_residency_idx").on(table.residencyId, table.updatedAt),
  check("client_assignment_terms_rate_nonnegative", sql`${table.rateCents} IS NULL OR ${table.rateCents} >= 0`),
]);

export const hfyTalentRequests = pgTable("hfy_talent_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  residencyId: uuid("residency_id").notNull().references(() => residencies.id, { onDelete: "cascade" }),
  shiftId: uuid("shift_id").notNull().references(() => shifts.id, { onDelete: "cascade" }),
  status: hfyTalentRequestStatus("status").notNull().default("pending"),
  fulfilledAssignmentId: uuid("fulfilled_assignment_id").references(() => assignments.id, { onDelete: "set null" }),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  fulfilledByUserId: uuid("fulfilled_by_user_id").references(() => users.id, { onDelete: "set null" }),
  fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("hfy_talent_requests_shift_unique").on(table.shiftId),
  uniqueIndex("hfy_talent_requests_assignment_unique").on(table.fulfilledAssignmentId).where(sql`${table.fulfilledAssignmentId} IS NOT NULL`),
  index("hfy_talent_requests_queue_idx").on(table.status, table.createdAt),
  check("hfy_talent_requests_fulfillment_valid", sql`
    (${table.status} = 'fulfilled' AND ${table.fulfilledAssignmentId} IS NOT NULL AND ${table.fulfilledByUserId} IS NOT NULL AND ${table.fulfilledAt} IS NOT NULL)
    OR
    (${table.status} <> 'fulfilled' AND ${table.fulfilledAssignmentId} IS NULL AND ${table.fulfilledByUserId} IS NULL AND ${table.fulfilledAt} IS NULL)
  `),
]);

export const invoiceLineItems = pgTable("invoice_line_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  sourceShiftId: uuid("source_shift_id").references(() => shifts.id, { onDelete: "set null" }),
  type: invoiceLineType("type").notNull(),
  serviceDate: date("service_date", { mode: "string" }),
  description: text("description").notNull(),
  unitLabel: text("unit_label").notNull().default("item"),
  quantityThousandths: integer("quantity_thousandths").notNull().default(1000),
  unitAmountCents: integer("unit_amount_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  adjustmentReason: text("adjustment_reason"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("invoice_line_items_invoice_idx").on(table.invoiceId, table.sortOrder),
  check("invoice_line_items_quantity_positive", sql`${table.quantityThousandths} > 0`),
  check("invoice_line_items_adjustment_reason", sql`${table.type} <> 'manual_adjustment' OR ${table.adjustmentReason} IS NOT NULL`),
]);

export const invoiceDeliveries = pgTable("invoice_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  invoiceVersion: integer("invoice_version").notNull(),
  recipient: text("recipient").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  providerMessageId: text("provider_message_id"),
  status: deliveryStatus("status").notNull().default("pending"),
  error: text("error"),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("invoice_deliveries_invoice_version_unique").on(table.invoiceId, table.invoiceVersion),
  uniqueIndex("invoice_deliveries_idempotency_key_unique").on(table.idempotencyKey),
]);

export const attentionItems = pgTable("attention_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  residencyId: uuid("residency_id").notNull().references(() => residencies.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  code: text("code").notNull(),
  message: text("message").notNull(),
  status: attentionStatus("status").notNull().default("open"),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (table) => [
  index("attention_items_residency_status_idx").on(table.residencyId, table.status, table.createdAt),
  uniqueIndex("attention_items_open_code_unique").on(table.entityType, table.entityId, table.code).where(sql`${table.status} = 'open'`),
]);

export const automationRuns = pgTable("automation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  residencyId: uuid("residency_id").notNull().references(() => residencies.id, { onDelete: "cascade" }),
  automationName: text("automation_name").notNull(),
  scheduledKey: text("scheduled_key").notNull(),
  status: automationStatus("status").notNull().default("running"),
  processedCount: integer("processed_count").notNull().default(0),
  changedCount: integer("changed_count").notNull().default(0),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("automation_runs_schedule_unique").on(table.residencyId, table.automationName, table.scheduledKey),
  index("automation_runs_status_idx").on(table.status, table.startedAt),
]);

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  residencyId: uuid("residency_id").references(() => residencies.id, { onDelete: "set null" }),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  actorLabel: text("actor_label").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("audit_log_residency_created_idx").on(table.residencyId, table.createdAt)]);

export type User = typeof users.$inferSelect;
export type AccountSetupToken = typeof accountSetupTokens.$inferSelect;
export type Residency = typeof residencies.$inferSelect;
export type PublicCalendarLink = typeof publicCalendarLinks.$inferSelect;
export type Daypart = typeof dayparts.$inferSelect;
export type DaypartDateException = typeof daypartDateExceptions.$inferSelect;
export type DaypartDayRule = typeof daypartDayRules.$inferSelect;
export type ScheduleOccurrence = typeof scheduleOccurrences.$inferSelect;
export type ScheduleOccurrenceTalent = typeof scheduleOccurrenceTalent.$inferSelect;
export type Talent = typeof talent.$inferSelect;
export type Shift = typeof shifts.$inferSelect;
export type Assignment = typeof assignments.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
