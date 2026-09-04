// Requires production Vercel/Supabase access and must only be run manually by Aus.
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

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

async function rows(table: string, select: string, apply?: (query: any) => any) {
  let query: any = supabase.from(table).select(select);
  if (apply) query = apply(query);
  const result = await query;
  if (result.error) throw new Error(`${table}: ${result.error.message}`);
  return result.data ?? [];
}

const aceRows = await rows(
  "residencies",
  "id,client_account_id,slug,name,city_state,timezone,tier,operating_mode,active,default_talent_rate_cents,client_hourly_rate_cents,payment_terms_days,invoice_frequency,billing_cycle_start_weekday,billing_cycle_length_days,scheduling_pattern,invoice_prefix",
  (query) => query.ilike("name", "%Ace%"),
);

const detail = [];
for (const residency of aceRows as any[]) {
  const [dayparts, rules, shifts, occurrences, invoices, approvals] = await Promise.all([
    rows("dayparts", "id,name,room,color,type,billing_mode,default_talent_rate_cents,active_until,active,sort_order", (query) => query.eq("residency_id", residency.id).order("sort_order")),
    rows("daypart_day_rules", "id,daypart_id,weekday,start_minute,end_minute,default_dj_count"),
    rows("shifts", "id,daypart_id,service_date,invoice_id,name", (query) => query.eq("residency_id", residency.id)),
    rows("schedule_occurrences", "id,daypart_id,service_date,name", (query) => query.eq("residency_id", residency.id)),
    rows("invoices", "id,status", (query) => query.eq("residency_id", residency.id)),
    rows("residency_talent", "id,talent_id,active", (query) => query.eq("residency_id", residency.id)),
  ]);
  const daypartIds = new Set((dayparts as any[]).map((row) => row.id));
  const scopedRules = (rules as any[]).filter((row) => daypartIds.has(row.daypart_id));
  const shiftIds = (shifts as any[]).map((row) => row.id);
  const assignments = shiftIds.length
    ? await rows("assignments", "id,shift_id,booking_status,payout_status", (query) => query.in("shift_id", shiftIds))
    : [];
  detail.push({
    residency,
    dayparts: (dayparts as any[]).map((daypart) => ({
      ...daypart,
      rules: scopedRules.filter((rule) => rule.daypart_id === daypart.id).map(({ id: _id, daypart_id: _daypartId, ...rule }) => rule),
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
    invoiceStatuses: (invoices as any[]).map((row) => row.status),
  });
}

const [allResidencies, talentRows] = await Promise.all([
  rows("residencies", "id,name,slug,active,operating_mode"),
  rows("talent", "id,airtable_record_id,stage_name,talent_status,exclusive_residency_id"),
]);

console.log(JSON.stringify({
  allResidencies,
  ace: detail,
  talent: {
    total: talentRows.length,
    airtableLinked: (talentRows as any[]).filter((row) => row.airtable_record_id).length,
    exclusive: (talentRows as any[]).filter((row) => row.exclusive_residency_id).length,
    active: (talentRows as any[]).filter((row) => row.talent_status === "active").length,
  },
}, null, 2));
