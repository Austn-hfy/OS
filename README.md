# HFY OS

HFY OS is the operating platform for hotel Residency programming. Production runs from `main`; the persistent `staging` branch deploys against a separate Supabase project for review and testing. The promotion and migration workflow is documented in [`docs/STAGING.md`](docs/STAGING.md).

The pilot includes:

- One internal All Residencies dashboard and Residency-filtered operating views.
- A shared Talent roster with an approved DJ list per Residency.
- Calendar, Shifts, Assignments, Ready to Pay, and native Invoices. Each Residency can create scheduled-service or independent custom Draft Invoices and owns its billing contact, terms, cadence, PDF presentation, and delivery rule.
- The four current Airtable automation outcomes.
- Internal, Residency-scoped workspaces for HFY operators. A separate hotel portal is intentionally deferred.
- A company Pipeline mode with Leads, ordered status tabs, editable contact/history, Lost retention, and in-place conversion of Won records into Operations Residencies.
- A private Artist onboarding form at `/join`.

The final boundary is recorded in [`docs/PILOT_SCOPE.md`](docs/PILOT_SCOPE.md).

## Local setup

Requirements: Node.js 22.17 or newer, pnpm 11, a Supabase project, a Vercel Pro project, and a verified Resend sending domain.

1. Copy `.env.example` to `.env` and fill every value. The checked-in Drizzle commands load `.env`; Vercel supplies the same values through project settings in deployed environments.
2. Install dependencies with `pnpm install`.
3. Apply the checked-in migrations with `pnpm db:migrate`.
4. Create the three private Storage buckets with `pnpm storage:bootstrap`.
5. Provision the internal operator:

   ```sh
   pnpm provision -- --email aus@example.com --password 'use-a-long-random-password' --name 'Aus' --role internal_admin
   ```

6. Start the app with `pnpm dev`, open the company-wide `/app/setup` view, and save the Invoice branding (company name, billing contact, address, and logo). Then create the first new-client Residency, Shifts, and approved DJ list. Open that Residency's Invoices page to configure its bill-to details, billing cadence, presentation, delivery rule, and Draft Invoices.
   To create the Ace build-and-prove fixture in a safe non-Ace database, run `pnpm seed:ace-parity`. It creates only the two specified Dayparts and the $80/hour Talent default; it does not contact Airtable and leaves the unknown client rate at $0 until an approved rate is entered.
7. Use the Residency switcher to verify calendar, Talent, payouts, Invoices, and Setup are scoped to the new program. Client-facing login behavior will be designed later; `/hotel` is not an active product surface.
8. Switch from Operations to Pipeline to create a Lead. Moving a Lead to Won requires its Residency foundation fields and updates that same database record into Operations; it does not create a replacement record.

## Verification

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The test suite contains:

- Direct output fixtures pulled read-only from the live Airtable base on August 21, 2026.
- Pure domain parity tests for compensation, payout eligibility, invoice formulas, and local-time auto-completion.
- Postgres integration tests for foreign keys, state checks, same-Residency invoice links, approved hotel Talent, Assignment time bounds, and cross-Residency DJ conflicts.
- Pipeline integration tests proving Won conversion preserves the same record identity and notes, while Lost Leads remain in Pipeline history.

## Scheduled automations

`vercel.json` invokes two authenticated, idempotent routes hourly:

- `/api/cron/auto-complete` preserves the 6:00 a.m. Residency-local auto-complete rule.
- `/api/cron/reconcile` catches Ready to Pay, Shift-to-Invoice, and approved-invoice delivery work missed by the immediate application path.

Set a strong `CRON_SECRET`; Vercel sends it as a bearer token. Vercel Pro is required for hourly scheduling.

## Deployment checklist

- Keep the `staging` and production Supabase projects isolated.
- Apply migrations and bootstrap private buckets in each project separately.
- Configure production environment variables in Vercel.
- Verify the Resend domain and `billing@hearforyou.group` reply inbox.
- Create the HFY admin manually.
- Run the full test suite.
- Complete one controlled production cycle: create Shift/Assignments → auto-complete → Ready to Pay → Paid.
- Complete one controlled scheduled Invoice cycle: select eligible Shifts → matching system total → approve/native PDF generation → exactly one email when auto-send is enabled.
- Complete one controlled custom Invoice cycle: add independent client line items → save Draft → approve/native PDF generation. Confirm it never links to or captures a Shift.
- Open the generated PDF and confirm it contains only hotel billing details: scheduled service dates, times, hours, client rates, and client totals. It must not contain artist identity, artist pay, payment details, or internal margin.
- Attempt cross-Residency access and overlapping DJ selection; both must fail.

Ace operational migration remains a later, separate project after one or preferably two clean billing cycles. The parity sandbox is not a migration or production cutover.
