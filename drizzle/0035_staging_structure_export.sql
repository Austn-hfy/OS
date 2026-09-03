CREATE SCHEMA IF NOT EXISTS private;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hfy_staging_structure_exporter') THEN
    CREATE ROLE hfy_staging_structure_exporter NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hfy_staging_structure_reader') THEN
    CREATE ROLE hfy_staging_structure_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;--> statement-breakpoint

GRANT hfy_staging_structure_exporter TO hfy_staging_structure_reader;--> statement-breakpoint
GRANT USAGE ON SCHEMA private TO hfy_staging_structure_exporter;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.hfy_staging_structure_snapshot(p_residency_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH selected_residencies AS MATERIALIZED (
    SELECT
      r.id,
      r.client_account_id,
      r.slug,
      r.name,
      r.city_state,
      r.timezone,
      r.tier,
      r.operating_mode,
      r.active,
      r.lead_source,
      r.pipeline_status,
      r.pipeline_status_changed_at,
      r.converted_at,
      r.default_talent_rate_cents,
      r.client_hourly_rate_cents,
      r.payment_terms_days,
      r.invoice_frequency,
      r.billing_cycle_start_weekday,
      r.billing_cycle_length_days,
      r.invoice_line_presentation,
      r.default_invoice_note,
      r.scheduling_pattern,
      r.invoice_prefix,
      r.client_payment_status_visible
    FROM public.residencies AS r
    WHERE r.slug = p_residency_slug
  ),
  selected_dayparts AS MATERIALIZED (
    SELECT d.*
    FROM public.dayparts AS d
    JOIN selected_residencies AS r ON r.id = d.residency_id
  ),
  selected_roster_assignments AS MATERIALIZED (
    SELECT rt.residency_id, rt.talent_id, rt.active, rt.client_visible
    FROM public.residency_talent AS rt
    JOIN selected_residencies AS r ON r.id = rt.residency_id
  ),
  selected_talent AS MATERIALIZED (
    SELECT t.*
    FROM public.talent AS t
    WHERE t.id IN (SELECT rt.talent_id FROM selected_roster_assignments AS rt)
  )
  SELECT jsonb_build_object(
    'sourceProjectRef', 'tkfsgifnywbwjdkxjhae',
    'clientAccounts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'active', c.active
      ) ORDER BY c.id)
      FROM public.client_accounts AS c
      WHERE c.id IN (SELECT r.client_account_id FROM selected_residencies AS r)
    ), '[]'::jsonb),
    'residencies', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'clientAccountId', r.client_account_id,
        'slug', r.slug,
        'name', r.name,
        'cityState', r.city_state,
        'timezone', r.timezone,
        'tier', r.tier,
        'operatingMode', r.operating_mode,
        'active', r.active,
        'leadSource', r.lead_source,
        'pipelineStatus', r.pipeline_status,
        'pipelineStatusChangedAt', r.pipeline_status_changed_at,
        'convertedAt', r.converted_at,
        'defaultTalentRateCents', r.default_talent_rate_cents,
        'clientHourlyRateCents', r.client_hourly_rate_cents,
        'paymentTermsDays', r.payment_terms_days,
        'invoiceFrequency', r.invoice_frequency,
        'billingCycleStartWeekday', r.billing_cycle_start_weekday,
        'billingCycleLengthDays', r.billing_cycle_length_days,
        'invoiceLinePresentation', r.invoice_line_presentation,
        'defaultInvoiceNote', r.default_invoice_note,
        'schedulingPattern', r.scheduling_pattern,
        'invoicePrefix', r.invoice_prefix,
        'clientPaymentStatusVisible', r.client_payment_status_visible
      ) ORDER BY r.slug)
      FROM selected_residencies AS r
    ), '[]'::jsonb),
    'dayparts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id,
        'residencyId', d.residency_id,
        'name', d.name,
        'room', d.room,
        'color', d.color,
        'type', d.type,
        'billingMode', d.billing_mode,
        'scheduleMode', d.schedule_mode,
        'suggestedStartMinute', d.suggested_start_minute,
        'suggestedEndMinute', d.suggested_end_minute,
        'defaultTalentRateCents', d.default_talent_rate_cents,
        'clientDefaultRateCents', d.client_default_rate_cents,
        'activeUntil', d.active_until,
        'active', d.active,
        'sortOrder', d.sort_order
      ) ORDER BY d.residency_id, d.sort_order, d.name)
      FROM selected_dayparts AS d
    ), '[]'::jsonb),
    'dayRules', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', rule.id,
        'daypartId', rule.daypart_id,
        'weekday', rule.weekday,
        'startMinute', rule.start_minute,
        'endMinute', rule.end_minute,
        'defaultDjCount', rule.default_dj_count
      ) ORDER BY rule.daypart_id, rule.weekday)
      FROM public.daypart_day_rules AS rule
      WHERE rule.daypart_id IN (SELECT d.id FROM selected_dayparts AS d)
    ), '[]'::jsonb),
    'dateExceptions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', exception.id,
        'daypartId', exception.daypart_id,
        'serviceDate', exception.service_date,
        'kind', exception.kind,
        'startMinute', exception.start_minute,
        'endMinute', exception.end_minute
      ) ORDER BY exception.daypart_id, exception.service_date)
      FROM public.daypart_date_exceptions AS exception
      WHERE exception.daypart_id IN (SELECT d.id FROM selected_dayparts AS d)
    ), '[]'::jsonb),
    'talent', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id,
        'stageName', t.stage_name,
        'ownership', t.ownership,
        'owningResidencyId', t.owning_residency_id,
        'exclusiveResidencyId', t.exclusive_residency_id,
        'rosterStatus', t.roster_status,
        'talentStatus', t.talent_status,
        'archivedAt', t.archived_at,
        'homeMarket', t.home_market,
        'genres', t.genres,
        'priority', t.priority,
        'hasPaymentProfile', EXISTS(
          SELECT 1 FROM public.talent_payment_profiles AS payment WHERE payment.talent_id = t.id
        ),
        'paymentMethod', COALESCE((
          SELECT payment.payment_method
          FROM public.talent_payment_profiles AS payment
          WHERE payment.talent_id = t.id
          LIMIT 1
        ), ''),
        'hasTaxDocument', EXISTS(
          SELECT 1 FROM public.talent_documents AS document WHERE document.talent_id = t.id
        )
      ) ORDER BY t.id)
      FROM selected_talent AS t
    ), '[]'::jsonb),
    'rosterAssignments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'residencyId', rt.residency_id,
        'talentId', rt.talent_id,
        'active', rt.active,
        'clientVisible', rt.client_visible
      ) ORDER BY rt.residency_id, rt.talent_id)
      FROM selected_roster_assignments AS rt
    ), '[]'::jsonb)
  )
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.hfy_staging_structure_snapshot(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.hfy_staging_structure_snapshot(text) FROM anon, authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.hfy_staging_structure_snapshot(text) TO hfy_staging_structure_exporter;--> statement-breakpoint

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM hfy_staging_structure_exporter, hfy_staging_structure_reader;--> statement-breakpoint
ALTER ROLE hfy_staging_structure_reader CONNECTION LIMIT 2;--> statement-breakpoint
ALTER ROLE hfy_staging_structure_reader SET statement_timeout = '15s';--> statement-breakpoint
ALTER ROLE hfy_staging_structure_reader SET default_transaction_read_only = on;
