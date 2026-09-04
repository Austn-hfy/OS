// Requires production Vercel/Supabase access and must only be run manually by Aus.
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

interface QueryError {
  message: string;
}

interface QueryResult<Row> {
  data: Row[] | null;
  error: QueryError | null;
}

type ReadQuery<Row> = PromiseLike<QueryResult<Row>>;
type ServiceTier = "operations_only" | "complete";
type OperatingMode = "pipeline" | "operations";
type DaypartType = "dj_artist" | "house_activity";
type DaypartBillingMode = "billed_by_hfy" | "tracking_only";
type InvoiceStatus = "draft" | "approved" | "sent" | "paid" | "void";
type TalentStatus = "active" | "inactive";
type BookingStatus = "open" | "offered" | "pending_hfy_confirmation" | "confirmed" | "completed" | "cancelled";
type PayoutStatus = "not_ready" | "ready_to_pay" | "paid" | "na";

interface ResidencyDetailRow {
  id: string;
  client_account_id: string;
  slug: string;
  name: string;
  city_state: string;
  timezone: string;
  tier: ServiceTier;
  operating_mode: OperatingMode;
  active: boolean;
  default_talent_rate_cents: number;
  client_hourly_rate_cents: number;
  payment_terms_days: number;
  invoice_frequency: string;
  billing_cycle_start_weekday: number;
  billing_cycle_length_days: number;
  scheduling_pattern: string;
  invoice_prefix: string;
}

interface DaypartRow {
  id: string;
  name: string;
  room: string;
  color: string;
  type: DaypartType;
  billing_mode: DaypartBillingMode | null;
  default_talent_rate_cents: number | null;
  active_until: string | null;
  active: boolean;
  sort_order: number;
}

interface DaypartRuleRow {
  id: string;
  daypart_id: string;
  weekday: number;
  start_minute: number;
  end_minute: number;
  default_dj_count: number | null;
}

interface ShiftRow {
  id: string;
  daypart_id: string | null;
  service_date: string;
  invoice_id: string | null;
  name: string;
}

interface ScheduleOccurrenceRow {
  id: string;
  daypart_id: string | null;
  service_date: string;
  name: string;
}

interface InvoiceRow {
  id: string;
  status: InvoiceStatus;
}

interface ResidencyTalentRow {
  id: string;
  talent_id: string;
  active: boolean;
}

interface AssignmentRow {
  id: string;
  shift_id: string;
  booking_status: BookingStatus;
  payout_status: PayoutStatus;
}

interface ResidencySummaryRow {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  operating_mode: OperatingMode;
}

interface TalentRow {
  id: string;
  airtable_record_id: string | null;
  stage_name: string;
  talent_status: TalentStatus;
  exclusive_residency_id: string | null;
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function productionEnvironment() {
  const home = required("HOME");
  const auth = JSON.parse(await readFile(`${home}/Library/Application Support/com.vercel.cli/auth.json`, "utf8"));
  const project = JSON.parse(await readFile(".vercel/project.json", "utf8"));
  const response = await fetch(`https://api.vercel.com/v9/projects/${project.projectId}/env?decrypt=true&teamId=${project.orgId}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  if (!response.ok) throw new Error(`Could not read the production environment (${response.status}).`);
  const payload = await response.json() as { envs?: Array<{ key: string; value?: string; target?: string[] }> };
  const values = new Map<string, string>();
  for (const variable of payload.envs ?? []) {
    if (!variable.target?.includes("production") || typeof variable.value !== "string") continue;
    values.set(variable.key, variable.value);
  }
  if (!values.get("NEXT_PUBLIC_SUPABASE_URL") || !values.get("SUPABASE_SERVICE_ROLE_KEY")) {
    console.error(JSON.stringify({
      productionEnvironmentMetadata: (payload.envs ?? [])
        .filter((variable) => variable.target?.includes("production"))
        .map((variable) => ({ key: variable.key, hasValue: typeof variable.value === "string" && variable.value.length > 0, valueLength: variable.value?.length ?? 0 })),
    }, null, 2));
  }
  return values;
}

const productionEnv = await productionEnvironment();
const supabase = createClient(
  productionEnv.get("NEXT_PUBLIC_SUPABASE_URL") ?? required("NEXT_PUBLIC_SUPABASE_URL"),
  productionEnv.get("SUPABASE_SERVICE_ROLE_KEY") ?? required("SUPABASE_SERVICE_ROLE_KEY"),
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

async function rows<Row>(table: string, query: ReadQuery<Row>) {
  const result = await query;
  if (result.error) throw new Error(`${table}: ${result.error.message}`);
  return result.data ?? [];
}

const aceRows = await rows<ResidencyDetailRow>(
  "residencies",
  supabase
    .from("residencies")
    .select("id,client_account_id,slug,name,city_state,timezone,tier,operating_mode,active,default_talent_rate_cents,client_hourly_rate_cents,payment_terms_days,invoice_frequency,billing_cycle_start_weekday,billing_cycle_length_days,scheduling_pattern,invoice_prefix")
    .ilike("name", "%Ace%"),
);

const detail = [];
for (const residency of aceRows) {
  const [dayparts, rules, shifts, occurrences, invoices, approvals] = await Promise.all([
    rows<DaypartRow>("dayparts", supabase.from("dayparts").select("id,name,room,color,type,billing_mode,default_talent_rate_cents,active_until,active,sort_order").eq("residency_id", residency.id).order("sort_order")),
    rows<DaypartRuleRow>("daypart_day_rules", supabase.from("daypart_day_rules").select("id,daypart_id,weekday,start_minute,end_minute,default_dj_count")),
    rows<ShiftRow>("shifts", supabase.from("shifts").select("id,daypart_id,service_date,invoice_id,name").eq("residency_id", residency.id)),
    rows<ScheduleOccurrenceRow>("schedule_occurrences", supabase.from("schedule_occurrences").select("id,daypart_id,service_date,name").eq("residency_id", residency.id)),
    rows<InvoiceRow>("invoices", supabase.from("invoices").select("id,status").eq("residency_id", residency.id)),
    rows<ResidencyTalentRow>("residency_talent", supabase.from("residency_talent").select("id,talent_id,active").eq("residency_id", residency.id)),
  ]);
  const daypartIds = new Set(dayparts.map((row) => row.id));
  const scopedRules = rules.filter((row) => daypartIds.has(row.daypart_id));
  const shiftIds = shifts.map((row) => row.id);
  const assignments = shiftIds.length
    ? await rows<AssignmentRow>("assignments", supabase.from("assignments").select("id,shift_id,booking_status,payout_status").in("shift_id", shiftIds))
    : [];
  detail.push({
    residency,
    dayparts: dayparts.map((daypart) => ({
      ...daypart,
      rules: scopedRules
        .filter((rule) => rule.daypart_id === daypart.id)
        .map((rule) => ({
          weekday: rule.weekday,
          start_minute: rule.start_minute,
          end_minute: rule.end_minute,
          default_dj_count: rule.default_dj_count,
        })),
    })),
    counts: {
      shifts: shifts.length,
      assignments: assignments.length,
      scheduleOccurrences: occurrences.length,
      invoices: invoices.length,
      residencyTalent: approvals.length,
    },
    shiftSummary: shifts,
    occurrenceSummary: occurrences,
    invoiceStatuses: invoices.map((row) => row.status),
  });
}

const [allResidencies, talentRows] = await Promise.all([
  rows<ResidencySummaryRow>("residencies", supabase.from("residencies").select("id,name,slug,active,operating_mode")),
  rows<TalentRow>("talent", supabase.from("talent").select("id,airtable_record_id,stage_name,talent_status,exclusive_residency_id")),
]);

console.log(JSON.stringify({
  allResidencies,
  ace: detail,
  talent: {
    total: talentRows.length,
    airtableLinked: talentRows.filter((row) => row.airtable_record_id).length,
    exclusive: talentRows.filter((row) => row.exclusive_residency_id).length,
    active: talentRows.filter((row) => row.talent_status === "active").length,
  },
}, null, 2));
