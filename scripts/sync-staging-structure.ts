import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import postgres, { type Sql, type TransactionSql } from "postgres";
import { encryptSensitiveField } from "../src/lib/field-encryption";
import {
  assertSafeSyncApiEnvironment,
  assertSafeSyncEnvironment,
  assertSafeStagingDestination,
  buildStagingResidencyPlan,
  formatDryRunReport,
  parseProductionStructureSnapshot,
  stagingSyncUuid,
  type ExistingStagingState,
  type ProductionStructureSnapshot,
  type SourceClientAccount,
  type SourceDateException,
  type SourceDaypart,
  type SourceDayRule,
  type SourceResidency,
  type SourceRosterAssignment,
  type SourceTalent,
  type StagingResidencyPlan,
} from "../src/domain/staging-structure-sync";

type Queryable = Sql<Record<string, never>> | TransactionSql<Record<string, never>>;

const REQUIRED_COLUMNS: Record<string, string[]> = {
  client_accounts: ["id", "name", "active", "internal_notes"],
  residencies: [
    "id", "client_account_id", "slug", "name", "city_state", "timezone", "tier", "operating_mode", "active",
    "default_talent_rate_cents", "client_hourly_rate_cents", "payment_terms_days", "invoice_frequency",
    "billing_cycle_start_weekday", "billing_cycle_length_days", "invoice_line_presentation", "scheduling_pattern",
    "invoice_prefix", "client_payment_status_visible",
  ],
  dayparts: [
    "id", "residency_id", "name", "room", "color", "type", "billing_mode", "schedule_mode",
    "suggested_start_minute", "suggested_end_minute", "default_talent_rate_cents", "client_default_rate_cents",
    "active_until", "active", "sort_order",
  ],
  daypart_day_rules: ["id", "daypart_id", "weekday", "start_minute", "end_minute", "default_dj_count"],
  daypart_date_exceptions: ["id", "daypart_id", "service_date", "kind", "start_minute", "end_minute"],
  talent: [
    "id", "airtable_record_id", "stage_name", "ownership", "owning_residency_id", "exclusive_residency_id",
    "roster_status", "talent_status", "archived_at", "home_market", "genres", "priority",
  ],
  talent_payment_profiles: ["talent_id", "payment_method"],
  talent_documents: ["talent_id", "kind"],
  residency_talent: ["id", "residency_id", "talent_id", "active", "client_visible"],
  audit_log: ["residency_id", "actor_label", "action", "entity_type", "entity_id", "details"],
};

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function optionalEnvironment(name: string): string | undefined {
  return process.env[name] || undefined;
}

function optionalSecret(name: string, fileName: string): string | undefined {
  const direct = optionalEnvironment(name);
  const filePath = optionalEnvironment(fileName);
  if (direct && filePath) throw new Error(`Set ${name} or ${fileName}, not both.`);
  return direct ?? (filePath ? readFileSync(/* turbopackIgnore: true */ filePath, "utf8").trim() : undefined);
}

function argumentValues(name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name) {
      const value = process.argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
      values.push(value);
    }
  }
  return values;
}

function selection() {
  const slugs = argumentValues("--residency").map((slug) => slug.trim()).filter(Boolean);
  const all = process.argv.includes("--all");
  if (all && slugs.length) throw new Error("Use --residency or --all, not both.");
  if (!all && !slugs.length) throw new Error("Pass --residency <slug>. Use --all --confirm-all-residencies only for an intentional all-Residency sync.");
  if (all && !process.argv.includes("--confirm-all-residencies")) {
    throw new Error("--all requires --confirm-all-residencies.");
  }
  return { all, slugs: [...new Set(slugs)] };
}

function loadReviewedProductionSnapshot(filePath: string, requestedSlugs: string[]): ProductionStructureSnapshot {
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
  return parseProductionStructureSnapshot(parsed, requestedSlugs);
}

export async function verifyRequiredSchema(sql: Queryable, label: string): Promise<void> {
  const tableNames = Object.keys(REQUIRED_COLUMNS);
  const rows = await sql<Array<{ tableName: string; columnName: string }>>`
    select table_name as "tableName", column_name as "columnName"
    from information_schema.columns
    where table_schema = 'public' and table_name in ${sql(tableNames)}
  `;
  const available = new Map<string, Set<string>>();
  for (const row of rows) {
    const columns = available.get(row.tableName) ?? new Set<string>();
    columns.add(row.columnName);
    available.set(row.tableName, columns);
  }
  const missing = Object.entries(REQUIRED_COLUMNS).flatMap(([table, columns]) => columns
    .filter((column) => !available.get(table)?.has(column))
    .map((column) => `${table}.${column}`));
  if (missing.length) throw new Error(`${label} schema is missing required sync columns: ${missing.join(", ")}`);
}

async function selectedResidencySlugs(sql: Queryable, all: boolean, requestedSlugs: string[]): Promise<string[]> {
  if (!all) return requestedSlugs;
  const rows = await sql<Array<{ slug: string }>>`
    select slug from residencies order by slug
  `;
  return rows.map((row) => row.slug);
}

async function loadProductionSnapshot(sql: Queryable, slugs: string[]): Promise<ProductionStructureSnapshot> {
  const residencyRows = await sql<SourceResidency[]>`
    select
      r.id,
      r.client_account_id as "clientAccountId",
      r.slug,
      r.name,
      r.city_state as "cityState",
      r.timezone,
      r.tier,
      r.operating_mode as "operatingMode",
      r.active,
      r.lead_source as "leadSource",
      r.pipeline_status as "pipelineStatus",
      r.pipeline_status_changed_at as "pipelineStatusChangedAt",
      r.converted_at as "convertedAt",
      r.default_talent_rate_cents as "defaultTalentRateCents",
      r.client_hourly_rate_cents as "clientHourlyRateCents",
      r.payment_terms_days as "paymentTermsDays",
      r.invoice_frequency as "invoiceFrequency",
      r.billing_cycle_start_weekday as "billingCycleStartWeekday",
      r.billing_cycle_length_days as "billingCycleLengthDays",
      r.invoice_line_presentation as "invoiceLinePresentation",
      r.default_invoice_note as "defaultInvoiceNote",
      r.scheduling_pattern as "schedulingPattern",
      r.invoice_prefix as "invoicePrefix",
      r.client_payment_status_visible as "clientPaymentStatusVisible"
    from residencies r
    where r.slug in ${sql(slugs)}
    order by r.slug
  `;
  const foundSlugs = new Set(residencyRows.map((residency) => residency.slug));
  const missingSlugs = slugs.filter((slug) => !foundSlugs.has(slug));
  if (missingSlugs.length) throw new Error(`Production Residency slug not found: ${missingSlugs.join(", ")}`);

  const clientAccountIds = [...new Set(residencyRows.map((residency) => residency.clientAccountId))];
  const residencyIds = residencyRows.map((residency) => residency.id);
  const clientAccounts = clientAccountIds.length ? await sql<SourceClientAccount[]>`
    select id, name, active
    from client_accounts
    where id in ${sql(clientAccountIds)}
  ` : [];
  const dayparts = residencyIds.length ? await sql<SourceDaypart[]>`
    select
      id,
      residency_id as "residencyId",
      name,
      room,
      color,
      type,
      billing_mode as "billingMode",
      schedule_mode as "scheduleMode",
      suggested_start_minute as "suggestedStartMinute",
      suggested_end_minute as "suggestedEndMinute",
      default_talent_rate_cents as "defaultTalentRateCents",
      client_default_rate_cents as "clientDefaultRateCents",
      active_until as "activeUntil",
      active,
      sort_order as "sortOrder"
    from dayparts
    where residency_id in ${sql(residencyIds)}
    order by residency_id, sort_order, name
  ` : [];
  const daypartIds = dayparts.map((daypart) => daypart.id);
  const dayRules = daypartIds.length ? await sql<SourceDayRule[]>`
    select
      id,
      daypart_id as "daypartId",
      weekday,
      start_minute as "startMinute",
      end_minute as "endMinute",
      default_dj_count as "defaultDjCount"
    from daypart_day_rules
    where daypart_id in ${sql(daypartIds)}
    order by daypart_id, weekday
  ` : [];
  const dateExceptions = daypartIds.length ? await sql<SourceDateException[]>`
    select
      id,
      daypart_id as "daypartId",
      service_date as "serviceDate",
      kind,
      start_minute as "startMinute",
      end_minute as "endMinute"
    from daypart_date_exceptions
    where daypart_id in ${sql(daypartIds)}
    order by daypart_id, service_date
  ` : [];
  const rosterAssignments = residencyIds.length ? await sql<SourceRosterAssignment[]>`
    select
      residency_id as "residencyId",
      talent_id as "talentId",
      active,
      client_visible as "clientVisible"
    from residency_talent
    where residency_id in ${sql(residencyIds)}
    order by residency_id, talent_id
  ` : [];
  const talentIds = [...new Set(rosterAssignments.map((assignment) => assignment.talentId))];
  const talent = talentIds.length ? await sql<SourceTalent[]>`
    select
      t.id,
      t.stage_name as "stageName",
      t.ownership,
      t.owning_residency_id as "owningResidencyId",
      t.exclusive_residency_id as "exclusiveResidencyId",
      t.roster_status as "rosterStatus",
      t.talent_status as "talentStatus",
      t.archived_at as "archivedAt",
      t.home_market as "homeMarket",
      t.genres,
      t.priority,
      exists(select 1 from talent_payment_profiles p where p.talent_id = t.id) as "hasPaymentProfile",
      coalesce((select p.payment_method from talent_payment_profiles p where p.talent_id = t.id limit 1), '') as "paymentMethod",
      exists(select 1 from talent_documents d where d.talent_id = t.id) as "hasTaxDocument"
    from talent t
    where t.id in ${sql(talentIds)}
    order by t.id
  ` : [];

  return { clientAccounts, residencies: residencyRows, dayparts, dayRules, dateExceptions, talent, rosterAssignments };
}

export async function loadRestrictedProductionSnapshot(
  sql: Queryable,
  slugs: string[],
): Promise<ProductionStructureSnapshot> {
  const snapshots: ProductionStructureSnapshot[] = [];
  for (const slug of slugs) {
    const rows = await sql<Array<{ snapshot: Record<string, unknown> }>>`
      select private.hfy_staging_structure_snapshot(${slug}) as snapshot
    `;
    if (!rows[0]?.snapshot) throw new Error(`Production structure export returned no result for ${slug}.`);
    snapshots.push(parseProductionStructureSnapshot(rows[0].snapshot, [slug]));
  }
  return snapshots.reduce<ProductionStructureSnapshot>((combined, snapshot) => ({
    clientAccounts: [...combined.clientAccounts, ...snapshot.clientAccounts],
    residencies: [...combined.residencies, ...snapshot.residencies],
    dayparts: [...combined.dayparts, ...snapshot.dayparts],
    dayRules: [...combined.dayRules, ...snapshot.dayRules],
    dateExceptions: [...combined.dateExceptions, ...snapshot.dateExceptions],
    talent: [...combined.talent, ...snapshot.talent],
    rosterAssignments: [...combined.rosterAssignments, ...snapshot.rosterAssignments],
  }), { clientAccounts: [], residencies: [], dayparts: [], dayRules: [], dateExceptions: [], talent: [], rosterAssignments: [] });
}

type ApiResult = {
  data: unknown;
  error: { message: string } | null;
};

function apiRows<T>(result: ApiResult, label: string): T[] {
  if (result.error) throw new Error(`Production ${label} query failed: ${result.error.message}`);
  if (!Array.isArray(result.data)) throw new Error(`Production ${label} query returned an invalid result.`);
  return result.data as T[];
}

async function selectedResidencySlugsFromApi(
  client: SupabaseClient,
  all: boolean,
  requestedSlugs: string[],
): Promise<string[]> {
  if (!all) return requestedSlugs;
  const result = await client.from("residencies").select("slug").order("slug");
  return apiRows<{ slug: string }>(result, "Residency slug").map((row) => row.slug);
}

async function loadProductionSnapshotFromApi(
  client: SupabaseClient,
  slugs: string[],
): Promise<ProductionStructureSnapshot> {
  type ResidencyRow = {
    id: string;
    client_account_id: string;
    slug: string;
    name: string;
    city_state: string;
    timezone: string;
    tier: SourceResidency["tier"];
    operating_mode: SourceResidency["operatingMode"];
    active: boolean;
    lead_source: SourceResidency["leadSource"];
    pipeline_status: string;
    pipeline_status_changed_at: string;
    converted_at: string | null;
    default_talent_rate_cents: number;
    client_hourly_rate_cents: number;
    payment_terms_days: number;
    invoice_frequency: string;
    billing_cycle_start_weekday: number;
    billing_cycle_length_days: number;
    invoice_line_presentation: SourceResidency["invoiceLinePresentation"];
    default_invoice_note: string;
    scheduling_pattern: string;
    invoice_prefix: string;
    client_payment_status_visible: boolean;
  };
  const residencyResult = await client.from("residencies").select([
    "id", "client_account_id", "slug", "name", "city_state", "timezone", "tier", "operating_mode", "active",
    "lead_source", "pipeline_status", "pipeline_status_changed_at", "converted_at", "default_talent_rate_cents",
    "client_hourly_rate_cents", "payment_terms_days", "invoice_frequency", "billing_cycle_start_weekday",
    "billing_cycle_length_days", "invoice_line_presentation", "default_invoice_note", "scheduling_pattern",
    "invoice_prefix", "client_payment_status_visible",
  ].join(",")).in("slug", slugs).order("slug");
  const residencyRows = apiRows<ResidencyRow>(residencyResult, "Residency");
  const foundSlugs = new Set(residencyRows.map((row) => row.slug));
  const missingSlugs = slugs.filter((slug) => !foundSlugs.has(slug));
  if (missingSlugs.length) throw new Error(`Production Residency slug not found: ${missingSlugs.join(", ")}`);
  const residencies: SourceResidency[] = residencyRows.map((row) => ({
    id: row.id,
    clientAccountId: row.client_account_id,
    slug: row.slug,
    name: row.name,
    cityState: row.city_state,
    timezone: row.timezone,
    tier: row.tier,
    operatingMode: row.operating_mode,
    active: row.active,
    leadSource: row.lead_source,
    pipelineStatus: row.pipeline_status,
    pipelineStatusChangedAt: new Date(row.pipeline_status_changed_at),
    convertedAt: row.converted_at ? new Date(row.converted_at) : null,
    defaultTalentRateCents: row.default_talent_rate_cents,
    clientHourlyRateCents: row.client_hourly_rate_cents,
    paymentTermsDays: row.payment_terms_days,
    invoiceFrequency: row.invoice_frequency,
    billingCycleStartWeekday: row.billing_cycle_start_weekday,
    billingCycleLengthDays: row.billing_cycle_length_days,
    invoiceLinePresentation: row.invoice_line_presentation,
    defaultInvoiceNote: row.default_invoice_note,
    schedulingPattern: row.scheduling_pattern,
    invoicePrefix: row.invoice_prefix,
    clientPaymentStatusVisible: row.client_payment_status_visible,
  }));
  const clientAccountIds = [...new Set(residencies.map((row) => row.clientAccountId))];
  const residencyIds = residencies.map((row) => row.id);

  type ClientAccountRow = { id: string; name: string; active: boolean };
  const clientAccountResult = clientAccountIds.length
    ? await client.from("client_accounts").select("id,name,active").in("id", clientAccountIds)
    : { data: [], error: null };
  const clientAccounts = apiRows<ClientAccountRow>(clientAccountResult, "client account");

  type DaypartRow = {
    id: string;
    residency_id: string;
    name: string;
    room: string;
    color: string;
    type: SourceDaypart["type"];
    billing_mode: SourceDaypart["billingMode"];
    schedule_mode: SourceDaypart["scheduleMode"];
    suggested_start_minute: number | null;
    suggested_end_minute: number | null;
    default_talent_rate_cents: number | null;
    client_default_rate_cents: number | null;
    active_until: string | null;
    active: boolean;
    sort_order: number;
  };
  const daypartResult = residencyIds.length
    ? await client.from("dayparts").select([
      "id", "residency_id", "name", "room", "color", "type", "billing_mode", "schedule_mode",
      "suggested_start_minute", "suggested_end_minute", "default_talent_rate_cents", "client_default_rate_cents",
      "active_until", "active", "sort_order",
    ].join(",")).in("residency_id", residencyIds).order("residency_id").order("sort_order").order("name")
    : { data: [], error: null };
  const daypartRows = apiRows<DaypartRow>(daypartResult, "Daypart");
  const dayparts: SourceDaypart[] = daypartRows.map((row) => ({
    id: row.id,
    residencyId: row.residency_id,
    name: row.name,
    room: row.room,
    color: row.color,
    type: row.type,
    billingMode: row.billing_mode,
    scheduleMode: row.schedule_mode,
    suggestedStartMinute: row.suggested_start_minute,
    suggestedEndMinute: row.suggested_end_minute,
    defaultTalentRateCents: row.default_talent_rate_cents,
    clientDefaultRateCents: row.client_default_rate_cents,
    activeUntil: row.active_until,
    active: row.active,
    sortOrder: row.sort_order,
  }));
  const daypartIds = dayparts.map((row) => row.id);

  type DayRuleRow = { id: string; daypart_id: string; weekday: number; start_minute: number; end_minute: number; default_dj_count: number | null };
  const dayRuleResult = daypartIds.length
    ? await client.from("daypart_day_rules").select("id,daypart_id,weekday,start_minute,end_minute,default_dj_count").in("daypart_id", daypartIds).order("daypart_id").order("weekday")
    : { data: [], error: null };
  const dayRules: SourceDayRule[] = apiRows<DayRuleRow>(dayRuleResult, "Day Rule").map((row) => ({
    id: row.id,
    daypartId: row.daypart_id,
    weekday: row.weekday,
    startMinute: row.start_minute,
    endMinute: row.end_minute,
    defaultDjCount: row.default_dj_count,
  }));

  type DateExceptionRow = { id: string; daypart_id: string; service_date: string; kind: SourceDateException["kind"]; start_minute: number | null; end_minute: number | null };
  const exceptionResult = daypartIds.length
    ? await client.from("daypart_date_exceptions").select("id,daypart_id,service_date,kind,start_minute,end_minute").in("daypart_id", daypartIds).order("daypart_id").order("service_date")
    : { data: [], error: null };
  const dateExceptions: SourceDateException[] = apiRows<DateExceptionRow>(exceptionResult, "date exception").map((row) => ({
    id: row.id,
    daypartId: row.daypart_id,
    serviceDate: row.service_date,
    kind: row.kind,
    startMinute: row.start_minute,
    endMinute: row.end_minute,
  }));

  type RosterAssignmentRow = { residency_id: string; talent_id: string; active: boolean; client_visible: boolean };
  const assignmentResult = residencyIds.length
    ? await client.from("residency_talent").select("residency_id,talent_id,active,client_visible").in("residency_id", residencyIds).order("residency_id").order("talent_id")
    : { data: [], error: null };
  const assignmentRows = apiRows<RosterAssignmentRow>(assignmentResult, "roster assignment");
  const rosterAssignments: SourceRosterAssignment[] = assignmentRows.map((row) => ({
    residencyId: row.residency_id,
    talentId: row.talent_id,
    active: row.active,
    clientVisible: row.client_visible,
  }));
  const talentIds = [...new Set(rosterAssignments.map((row) => row.talentId))];

  type TalentRow = {
    id: string;
    stage_name: string;
    ownership: SourceTalent["ownership"];
    owning_residency_id: string | null;
    exclusive_residency_id: string | null;
    roster_status: SourceTalent["rosterStatus"];
    talent_status: SourceTalent["talentStatus"];
    archived_at: string | null;
    home_market: string;
    genres: string[];
    priority: number | null;
  };
  const talentResult = talentIds.length
    ? await client.from("talent").select([
      "id", "stage_name", "ownership", "owning_residency_id", "exclusive_residency_id", "roster_status",
      "talent_status", "archived_at", "home_market", "genres", "priority",
    ].join(",")).in("id", talentIds).order("id")
    : { data: [], error: null };
  const talentRows = apiRows<TalentRow>(talentResult, "Talent");
  type PaymentPresenceRow = { talent_id: string; payment_method: string };
  const paymentResult = talentIds.length
    ? await client.from("talent_payment_profiles").select("talent_id,payment_method").in("talent_id", talentIds)
    : { data: [], error: null };
  const paymentRows = apiRows<PaymentPresenceRow>(paymentResult, "payment-profile presence");
  const paymentByTalent = new Map(paymentRows.map((row) => [row.talent_id, row.payment_method]));
  type DocumentPresenceRow = { talent_id: string; kind: string };
  const documentResult = talentIds.length
    ? await client.from("talent_documents").select("talent_id,kind").in("talent_id", talentIds)
    : { data: [], error: null };
  const documentTalentIds = new Set(apiRows<DocumentPresenceRow>(documentResult, "tax-document presence").map((row) => row.talent_id));
  const talent: SourceTalent[] = talentRows.map((row) => ({
    id: row.id,
    stageName: row.stage_name,
    ownership: row.ownership,
    owningResidencyId: row.owning_residency_id,
    exclusiveResidencyId: row.exclusive_residency_id,
    rosterStatus: row.roster_status,
    talentStatus: row.talent_status,
    archivedAt: row.archived_at ? new Date(row.archived_at) : null,
    homeMarket: row.home_market,
    genres: row.genres,
    priority: row.priority,
    hasPaymentProfile: paymentByTalent.has(row.id),
    paymentMethod: paymentByTalent.get(row.id) ?? "",
    hasTaxDocument: documentTalentIds.has(row.id),
  }));

  return { clientAccounts, residencies, dayparts, dayRules, dateExceptions, talent, rosterAssignments };
}

export async function loadExistingStagingState(
  sql: Queryable,
  source: ProductionStructureSnapshot,
  sourceResidency: SourceResidency,
): Promise<ExistingStagingState> {
  const deterministicResidencyId = stagingSyncUuid("residency", sourceResidency.id);
  const residencyRows = await sql<Array<{ id: string; clientAccountId: string; slug: string }>>`
    select id, client_account_id as "clientAccountId", slug
    from residencies
    where slug = ${sourceResidency.slug} or id = ${deterministicResidencyId}
  `;
  if (residencyRows.length > 1 || residencyRows.some((row) => row.slug !== sourceResidency.slug)) {
    throw new Error(`Staging has a conflicting Residency identity for ${sourceResidency.slug}. No changes were made.`);
  }
  const residency = residencyRows[0] ?? null;
  const assignedSourceTalentIds = source.rosterAssignments
    .filter((assignment) => assignment.residencyId === sourceResidency.id)
    .map((assignment) => stagingSyncUuid("talent", assignment.talentId));
  const talent = assignedSourceTalentIds.length ? await sql<Array<{ id: string; airtableRecordId: string | null }>>`
    select id, airtable_record_id as "airtableRecordId"
    from talent
    where id in ${sql(assignedSourceTalentIds)}
  ` : [];
  if (!residency) return {
    residencyId: null,
    clientAccountId: null,
    clientAccountSharedWithOtherResidency: false,
    dayparts: [],
    talent,
    rosterAssignments: [],
  };
  const [dayparts, rosterAssignments, sharedClientRows] = await Promise.all([
    sql<Array<{ id: string; name: string; active: boolean }>>`
      select id, name, active from dayparts where residency_id = ${residency.id}
    `,
    sql<Array<{ talentId: string; active: boolean; clientVisible: boolean }>>`
      select talent_id as "talentId", active, client_visible as "clientVisible"
      from residency_talent where residency_id = ${residency.id}
    `,
    sql<Array<{ shared: boolean }>>`
      select exists(
        select 1 from residencies
        where client_account_id = ${residency.clientAccountId} and id <> ${residency.id}
      ) as shared
    `,
  ]);
  return {
    residencyId: residency.id,
    clientAccountId: residency.clientAccountId,
    clientAccountSharedWithOtherResidency: sharedClientRows[0]?.shared ?? false,
    dayparts,
    talent,
    rosterAssignments,
  };
}

export async function applyResidencyPlan(
  tx: TransactionSql<Record<string, never>>,
  plan: StagingResidencyPlan,
  stagingEncryptionKey: string,
  actor: { userId?: string; label?: string } = {},
): Promise<void> {
  await tx`
    insert into client_accounts (id, name, active, internal_notes, updated_at)
    values (${plan.clientAccountId}, ${plan.clientAccount.name}, ${plan.clientAccount.active}, ${plan.clientAccount.internalNotes}, now())
    on conflict (id) do update set
      name = excluded.name,
      active = excluded.active,
      internal_notes = excluded.internal_notes,
      updated_at = now()
  `;
  const residency = plan.residency;
  await tx`
    insert into residencies (
      id, client_account_id, slug, name, city_state, timezone, tier, operating_mode, active,
      primary_contact_name, primary_contact_phone, primary_contact_email, lead_source, pipeline_status,
      pipeline_status_changed_at, lead_notes, converted_at, default_talent_rate_cents, client_hourly_rate_cents,
      payment_terms_days, invoice_frequency, billing_cycle_start_weekday, billing_cycle_length_days,
      invoice_line_presentation, default_invoice_note, scheduling_pattern, billing_contact_email,
      billing_contact_name, billing_address, invoice_prefix, auto_send_invoices, auto_send_reason,
      client_payment_status_visible, internal_notes, updated_at
    ) values (
      ${plan.residencyId}, ${plan.clientAccountId}, ${residency.slug}, ${residency.name}, ${residency.cityState},
      ${residency.timezone}, ${residency.tier}, ${residency.operatingMode}, ${residency.active},
      ${residency.primaryContactName}, ${residency.primaryContactPhone}, ${residency.primaryContactEmail},
      ${residency.leadSource}, ${residency.pipelineStatus}, ${residency.pipelineStatusChangedAt}, ${residency.leadNotes},
      ${residency.convertedAt}, ${residency.defaultTalentRateCents}, ${residency.clientHourlyRateCents},
      ${residency.paymentTermsDays}, ${residency.invoiceFrequency}, ${residency.billingCycleStartWeekday},
      ${residency.billingCycleLengthDays}, ${residency.invoiceLinePresentation}, ${residency.defaultInvoiceNote},
      ${residency.schedulingPattern}, ${residency.billingContactEmail}, ${residency.billingContactName},
      ${residency.billingAddress}, ${residency.invoicePrefix}, false, ${residency.autoSendReason},
      ${residency.clientPaymentStatusVisible}, ${residency.internalNotes}, now()
    )
    on conflict (id) do update set
      client_account_id = excluded.client_account_id,
      slug = excluded.slug,
      name = excluded.name,
      city_state = excluded.city_state,
      timezone = excluded.timezone,
      tier = excluded.tier,
      operating_mode = excluded.operating_mode,
      active = excluded.active,
      primary_contact_name = excluded.primary_contact_name,
      primary_contact_phone = excluded.primary_contact_phone,
      primary_contact_email = excluded.primary_contact_email,
      lead_source = excluded.lead_source,
      pipeline_status = excluded.pipeline_status,
      pipeline_status_changed_at = excluded.pipeline_status_changed_at,
      lead_notes = excluded.lead_notes,
      converted_at = excluded.converted_at,
      default_talent_rate_cents = excluded.default_talent_rate_cents,
      client_hourly_rate_cents = excluded.client_hourly_rate_cents,
      payment_terms_days = excluded.payment_terms_days,
      invoice_frequency = excluded.invoice_frequency,
      billing_cycle_start_weekday = excluded.billing_cycle_start_weekday,
      billing_cycle_length_days = excluded.billing_cycle_length_days,
      invoice_line_presentation = excluded.invoice_line_presentation,
      default_invoice_note = excluded.default_invoice_note,
      scheduling_pattern = excluded.scheduling_pattern,
      billing_contact_email = excluded.billing_contact_email,
      billing_contact_name = excluded.billing_contact_name,
      billing_address = excluded.billing_address,
      invoice_prefix = excluded.invoice_prefix,
      auto_send_invoices = false,
      auto_send_reason = excluded.auto_send_reason,
      client_payment_status_visible = excluded.client_payment_status_visible,
      internal_notes = excluded.internal_notes,
      updated_at = now()
  `;

  const plannedDaypartIds = plan.dayparts.map((daypart) => daypart.id);
  if (plannedDaypartIds.length) {
    await tx`
      update dayparts set active = false, updated_at = now()
      where residency_id = ${plan.residencyId} and id not in ${tx(plannedDaypartIds)} and active = true
    `;
  } else {
    await tx`update dayparts set active = false, updated_at = now() where residency_id = ${plan.residencyId} and active = true`;
  }
  for (const daypart of plan.dayparts) {
    await tx`
      insert into dayparts (
        id, residency_id, name, room, color, type, billing_mode, schedule_mode, suggested_start_minute,
        suggested_end_minute, default_talent_rate_cents, client_default_rate_cents, active_until, active, sort_order, updated_at
      ) values (
        ${daypart.id}, ${plan.residencyId}, ${daypart.name}, ${daypart.room}, ${daypart.color}, ${daypart.type},
        ${daypart.billingMode}, ${daypart.scheduleMode}, ${daypart.suggestedStartMinute}, ${daypart.suggestedEndMinute},
        ${daypart.defaultTalentRateCents}, ${daypart.clientDefaultRateCents}, ${daypart.activeUntil}, ${daypart.active},
        ${daypart.sortOrder}, now()
      )
      on conflict (id) do update set
        name = excluded.name,
        room = excluded.room,
        color = excluded.color,
        type = excluded.type,
        billing_mode = excluded.billing_mode,
        schedule_mode = excluded.schedule_mode,
        suggested_start_minute = excluded.suggested_start_minute,
        suggested_end_minute = excluded.suggested_end_minute,
        default_talent_rate_cents = excluded.default_talent_rate_cents,
        client_default_rate_cents = excluded.client_default_rate_cents,
        active_until = excluded.active_until,
        active = excluded.active,
        sort_order = excluded.sort_order,
        updated_at = now()
    `;
  }
  if (plannedDaypartIds.length) {
    await tx`delete from daypart_day_rules where daypart_id in ${tx(plannedDaypartIds)}`;
    await tx`delete from daypart_date_exceptions where daypart_id in ${tx(plannedDaypartIds)}`;
  }
  for (const rule of plan.dayRules) {
    await tx`
      insert into daypart_day_rules (id, daypart_id, weekday, start_minute, end_minute, default_dj_count, updated_at)
      values (${rule.id}, ${rule.daypartId}, ${rule.weekday}, ${rule.startMinute}, ${rule.endMinute}, ${rule.defaultDjCount}, now())
    `;
  }
  for (const exception of plan.dateExceptions) {
    await tx`
      insert into daypart_date_exceptions (id, daypart_id, service_date, kind, start_minute, end_minute, created_by_user_id, updated_at)
      values (${exception.id}, ${exception.daypartId}, ${exception.serviceDate}, ${exception.kind}, ${exception.startMinute}, ${exception.endMinute}, null, now())
    `;
  }

  const targetTalentIds = plan.talent.map((artist) => artist.id);
  for (const artist of plan.talent) {
    await tx`
      insert into talent (
        id, airtable_record_id, stage_name, full_name, email, phone, instagram_handle, client_contact,
        ownership, owning_residency_id, exclusive_residency_id, roster_status, talent_status, archived_at,
        home_market, genres, priority, talent_notes, legacy_outstanding_owed_cents, legacy_total_earnings_cents,
        legacy_owed_from, legacy_upcoming_bookings, airtable_roster_status_label, airtable_talent_status_label,
        airtable_imported_at, updated_at
      ) values (
        ${artist.id}, ${artist.stagingSyncKey}, ${artist.stageName}, ${artist.fullName}, ${artist.email}, ${artist.phone},
        ${artist.instagramHandle}, ${artist.clientContact}, ${artist.ownership}, ${artist.owningResidencyId},
        ${artist.exclusiveResidencyId}, ${artist.rosterStatus}, ${artist.talentStatus}, ${artist.archivedAt},
        ${artist.homeMarket}, ${tx.array(artist.genres)}, ${artist.priority}, ${artist.talentNotes}, 0, 0, '', '',
        'Staging sync', 'Staging sync', now(), now()
      )
      on conflict (id) do update set
        airtable_record_id = excluded.airtable_record_id,
        stage_name = excluded.stage_name,
        full_name = excluded.full_name,
        email = excluded.email,
        phone = excluded.phone,
        instagram_handle = excluded.instagram_handle,
        client_contact = excluded.client_contact,
        ownership = excluded.ownership,
        owning_residency_id = excluded.owning_residency_id,
        exclusive_residency_id = excluded.exclusive_residency_id,
        roster_status = excluded.roster_status,
        talent_status = excluded.talent_status,
        archived_at = excluded.archived_at,
        home_market = excluded.home_market,
        genres = excluded.genres,
        priority = excluded.priority,
        talent_notes = excluded.talent_notes,
        legacy_outstanding_owed_cents = 0,
        legacy_total_earnings_cents = 0,
        legacy_owed_from = '',
        legacy_upcoming_bookings = '',
        airtable_roster_status_label = 'Staging sync',
        airtable_talent_status_label = 'Staging sync',
        airtable_imported_at = now(),
        updated_at = now()
    `;
  }
  if (targetTalentIds.length) {
    await tx`delete from talent_payment_profiles where talent_id in ${tx(targetTalentIds)}`;
  }
  for (const artist of plan.talent) {
    const payment = artist.paymentProfile;
    if (!payment) continue;
    await tx`
      insert into talent_payment_profiles (
        talent_id, payment_method, zelle_email, zelle_phone, ach_account_name_encrypted,
        ach_routing_number_encrypted, ach_account_number_encrypted, last_four, updated_at
      ) values (
        ${artist.id}, ${payment.paymentMethod}, ${payment.zelleEmail}, ${payment.zellePhone},
        ${encryptSensitiveField(payment.achAccountName, stagingEncryptionKey)},
        ${encryptSensitiveField(payment.achRoutingNumber, stagingEncryptionKey)},
        ${encryptSensitiveField(payment.achAccountNumber, stagingEncryptionKey)},
        ${payment.lastFour}, now()
      )
    `;
  }

  if (targetTalentIds.length) {
    await tx`
      update residency_talent set active = false, client_visible = false
      where residency_id = ${plan.residencyId} and talent_id not in ${tx(targetTalentIds)} and active = true
    `;
  } else {
    await tx`
      update residency_talent set active = false, client_visible = false
      where residency_id = ${plan.residencyId} and active = true
    `;
  }
  for (const assignment of plan.rosterAssignments) {
    await tx`
      insert into residency_talent (id, residency_id, talent_id, active, client_visible, approved_by_user_id)
      values (${assignment.id}, ${plan.residencyId}, ${assignment.talentId}, ${assignment.active}, ${assignment.clientVisible}, null)
      on conflict (residency_id, talent_id) do update set
        active = excluded.active,
        client_visible = excluded.client_visible,
        approved_by_user_id = null
    `;
  }

  await tx`
    insert into audit_log (residency_id, actor_user_id, actor_label, action, entity_type, entity_id, details)
    values (
      ${plan.residencyId},
      ${actor.userId ?? null},
      ${actor.label ?? 'operator staging structure sync'},
      'staging_structure_synced_from_production',
      'residency',
      ${plan.residencyId},
      ${tx.json({
        sanitized: true,
        daypartCount: plan.dayparts.length,
        dayRuleCount: plan.dayRules.length,
        dateExceptionCount: plan.dateExceptions.length,
        artistCount: plan.talent.length,
        rosterAssignmentCount: plan.rosterAssignments.length,
        copiedAuthenticationRecords: 0,
        copiedSensitiveRecords: 0,
        requestedByUserId: actor.userId ?? null,
      })}
    )
  `;
}

export async function main(): Promise<void> {
  const requested = selection();
  const apply = process.argv.includes("--apply");
  const stagingDatabaseUrl = requiredEnvironment("STAGING_SYNC_DATABASE_URL");
  const productionSnapshotFiles = argumentValues("--production-snapshot-file");
  if (productionSnapshotFiles.length > 1) throw new Error("Pass --production-snapshot-file only once.");
  const productionSnapshotFile = productionSnapshotFiles[0];
  if (productionSnapshotFile && requested.all) {
    throw new Error("Reviewed snapshot input requires explicit --residency values; it cannot be combined with --all.");
  }
  const productionDatabaseUrl = optionalEnvironment("PRODUCTION_SYNC_DATABASE_URL");
  const productionApiUrl = optionalEnvironment("PRODUCTION_SYNC_SUPABASE_URL");
  const productionServiceRoleKey = optionalSecret(
    "PRODUCTION_SYNC_SERVICE_ROLE_KEY",
    "PRODUCTION_SYNC_SERVICE_ROLE_KEY_FILE",
  );
  if (productionSnapshotFile && (productionDatabaseUrl || productionApiUrl || productionServiceRoleKey)) {
    throw new Error("Configure one production source: reviewed snapshot, database URL, or Supabase URL plus service-role key.");
  }
  if (productionDatabaseUrl && (productionApiUrl || productionServiceRoleKey)) {
    throw new Error("Configure one production source: database URL or Supabase URL plus service-role key.");
  }
  if (productionSnapshotFile) {
    assertSafeStagingDestination(stagingDatabaseUrl);
  } else if (productionDatabaseUrl) {
    assertSafeSyncEnvironment(productionDatabaseUrl, stagingDatabaseUrl);
  } else {
    if (!productionApiUrl || !productionServiceRoleKey) {
      throw new Error("Set PRODUCTION_SYNC_DATABASE_URL, or set both PRODUCTION_SYNC_SUPABASE_URL and PRODUCTION_SYNC_SERVICE_ROLE_KEY.");
    }
    assertSafeSyncApiEnvironment(productionApiUrl, stagingDatabaseUrl);
  }

  const production = productionDatabaseUrl
    ? postgres(productionDatabaseUrl, { prepare: false, max: 1, connect_timeout: 15, idle_timeout: 10 })
    : null;
  const productionApi = productionApiUrl && productionServiceRoleKey
    ? createClient(productionApiUrl, productionServiceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
  const staging = postgres(stagingDatabaseUrl, { prepare: false, max: 1, connect_timeout: 15, idle_timeout: 10 });

  try {
    await verifyRequiredSchema(staging, "Staging");
    if (production) await verifyRequiredSchema(production, "Production");
    const snapshot = productionSnapshotFile
      ? loadReviewedProductionSnapshot(productionSnapshotFile, requested.slugs)
      : production
        ? await production.begin("read only", async (tx) => {
        const slugs = await selectedResidencySlugs(tx, requested.all, requested.slugs);
        if (!slugs.length) throw new Error("Production has no Residencies to synchronize.");
        return loadProductionSnapshot(tx, slugs);
        })
        : await (async () => {
          const slugs = await selectedResidencySlugsFromApi(productionApi!, requested.all, requested.slugs);
          if (!slugs.length) throw new Error("Production has no Residencies to synchronize.");
          return loadProductionSnapshotFromApi(productionApi!, slugs);
        })();
    const plans: StagingResidencyPlan[] = [];
    for (const sourceResidency of snapshot.residencies) {
      const target = await loadExistingStagingState(staging, snapshot, sourceResidency);
      plans.push(buildStagingResidencyPlan(snapshot, sourceResidency.id, target));
    }
    process.stdout.write(`${formatDryRunReport(plans, apply)}\n`);
    if (apply) {
      const stagingEncryptionKey = plans.some((plan) => plan.report.syntheticPaymentProfiles > 0)
        ? requiredEnvironment("STAGING_SYNC_PAYMENT_ENCRYPTION_KEY")
        : "";
      await staging.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(2026090201)`;
        for (const plan of plans) await applyResidencyPlan(tx, plan, stagingEncryptionKey);
      });
      process.stdout.write("All selected staging changes committed atomically.\n");
    }
  } finally {
    await Promise.all([
      ...(production ? [production.end({ timeout: 5 })] : []),
      staging.end({ timeout: 5 }),
    ]);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
