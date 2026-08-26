# HFY OS — Production Status and Priority Review

**Status date:** August 26, 2026  
**Production application:** https://hfy-os.vercel.app  
**Environment model:** One real production environment; no staging environment yet.

## Purpose of this document

This is the current verified state of HFY OS after connecting GitHub, Vercel, Supabase, and Resend. Please review it for technical accuracy, risk, and priority order—especially the recommendation at the end.

## Infrastructure work completed

- HFY OS is deployed successfully and the production login page is healthy.
- A Resend API key with **Sending access** was created and stored securely in Vercel.
- `INVOICE_FROM_EMAIL` is set to `billing@hearforyou.group` in Vercel.
- Production was redeployed successfully after adding the Resend configuration.
- `hearforyou.group` was registered as a sending domain in Resend.
- The HFY OS owner was provisioned as `austyn@hearforyou.group` with the `internal_admin` role.
- Supabase recorded the owner invitation as issued. It has not yet been accepted.
- Both Vercel Cron endpoints were previously invoked manually and returned HTTP 200.

## Remaining Resend setup

The Resend domain is registered but not yet verified. Resend requires DKIM, sending, and optional DMARC DNS records to be added through Squarespace.

The Squarespace account was not signed in during setup, so those DNS changes could not be completed. Until the DNS records are installed and verified, `billing@hearforyou.group` cannot be treated as a production-ready sender.

## 1. Pipeline mode

Pipeline mode is already built and deployed. It is not merely being discussed or sitting as uncommitted work.

The deployed implementation includes:

- Operations/Pipeline mode toggle
- Separate Pipeline navigation
- Leads list with one status tab per pipeline stage
- Count badges and an All tab
- New Lead creation
- Editable Lead contact details, source, status, and accumulated notes
- Days-in-current-status calculation
- Lost Leads retained in Pipeline
- Won Leads converted in place into Operations Residencies without creating a second record

There are no uncommitted Pipeline changes in the repository.

Still intentionally unbuilt:

- Meetings calendar and Lead/Meeting linkage
- Rundown integration
- Proposal creation or sending from Leads

## 2. Native invoice PDF generation

The invoice PDF work is substantially implemented, not merely planned.

Completed:

- Canonical client-facing invoice snapshot builder
- Date-grouped scheduled-services presentation
- Custom invoice line-item support
- Playwright/Chromium HTML-to-PDF runtime
- Vercel-compatible `@sparticuz/chromium` packaging
- Fail-closed Approval sequence: validate → snapshot → generate → validate PDF → store → approve
- Storage in the existing `invoice-pdfs` bucket
- PDF path, source hash, SHA-256 checksum, byte size, version, timestamp, and generating user recorded on the Invoice
- PDF locked once the Invoice reaches Approved
- Download route for approved PDFs
- Idempotent approved-invoice delivery through Resend
- Manual-delivery exception preserved per Residency, including Ace
- Client-facing snapshot and PDF omit talent cost, artist payout data, gross margin, Zelle details, peer review, and other internal financial information
- Tests for client-safe content, escaping, amount reconciliation, broken Shift links, custom invoices, and date grouping

### Vercel/Chromium spike status

The Chromium dependency packages and deploys successfully on Vercel. A production packaging issue caused by a broad Playwright import was found through the Cron runtime and corrected.

However, a real Invoice PDF has **not yet been rendered inside the deployed Vercel runtime**. Production currently has zero Residencies, Artists, Leads, or Invoices, so there is no real Draft Invoice available to approve.

Therefore:

- Deployment/bundling proof: complete
- Local PDF rendering and template tests: complete
- Real serverless PDF invocation: still open
- Real stored-PDF download test: still open
- Real Resend delivery test: blocked until DNS verification is complete

## 3. Artist Lookup

The requested Artist Lookup implementation is complete.

It includes:

- Navigation renamed from Talent to Artist Lookup
- Searchable, scrollable artist roster on the left
- Artist detail panel on the right
- Active/Inactive status
- Prominent Total Outstanding Owed
- Unpaid Assignment breakdown by Residency, date, and amount
- Upcoming-bookings list
- Visual monthly booking calendar
- Contact information
- Payment-method details
- Full Edit Artist drawer for identity, contact, roster, status, notes, and payment fields

There is no known missing UI requirement from the approved Artist Lookup scope.

Operational caveat: production has zero Artist records, so it has not yet been acceptance-tested with real production data.

## 4. Row-level security

Verified production state:

- **20 public tables have RLS enabled**
- **0 RLS policies exist**

The application uses an authenticated server-side database connection with full access. Direct unauthenticated Supabase API access is blocked by enabled-but-policy-less RLS, but Residency isolation inside the application currently depends on server-side authorization and query scoping.

The Supabase publishable key is present in browser code, but its only client-side use is `supabase.auth.signInWithPassword()` on the login form. No client component queries PostgREST tables, calls database RPCs, or reads/writes Supabase Storage. Operational data access goes through server code.

Conclusion: the current zero-policy posture is default-deny for browser data access. Real Residency policies remain planned Phase 2 hardening, but the deferral is closed as safe for the current server-only architecture.

## 5. Supabase backups and point-in-time recovery

The Supabase organization is currently on the Free plan.

Verified state:

- Scheduled project backups: **not available/configured**
- Point-in-time recovery: **not available/configured**

Supabase Pro includes up to seven days of daily database backups. PITR is a separate add-on, starting at approximately $100 per month for seven days of recovery history.

Important limitation: Supabase database backups include database records and Storage metadata, but not the actual objects stored through the Storage API. Invoice PDFs, uploaded logos, and Talent documents would need their own storage-backup/export strategy.

Reference: https://supabase.com/docs/guides/platform/backups

## 6. Infrastructure-level alerting

### Deployment failures

External notification exists. Vercel email notifications are enabled for `austyn@hearforyou.group`, including Deployment Failures.

Reference: https://vercel.com/kb/guide/how-do-i-get-notified-when-my-vercel-deployment-fails

### Cron failures or missed executions

Healthchecks.io was selected for the external watchdog. HFY OS now contains separate, server-only success-ping integrations for each job:

- `HEALTHCHECKS_AUTO_COMPLETE_URL`
- `HEALTHCHECKS_RECONCILE_URL`

Each handler sends its ping only after its database automation completes successfully. It does not ping at job start. A job that is never invoked, throws before completion, or cannot reach its success endpoint will therefore remain missed in Healthchecks.io.

The Healthchecks.io account magic link has been sent to `austyn@hearforyou.group`. The two checks and production environment values still need to be created after that link is accepted.

The active production schedules are:

- `/api/cron/auto-complete` — daily at `0 12 * * *`
- `/api/cron/reconcile` — daily at `15 12 * * *`

Both are enabled and have successfully returned HTTP 200 when manually invoked. However:

- Vercel Hobby provides a flexible one-hour execution window.
- Vercel does not retry a failed Cron invocation.
- Logs can show a failed request after the fact.
- No external service currently detects that a job never fired.
- If Vercel fails to invoke both jobs, HFY OS cannot create its own in-app Attention item about the missed execution.

Reference: https://vercel.com/docs/cron-jobs/manage-cron-jobs

## Production data state

At the time of verification, production contained:

- Operations Residencies: 0
- Pipeline Leads: 0
- Artists: 0
- Invoices: 0
- Invoices with stored PDFs: 0
- Approved, Sent, or Paid Invoices: 0

Ace remains outside this production database and continues operating in Airtable, as planned.

## Recommended priority order

The next long session should **not** be framed as building invoice PDF generation from scratch. That implementation already exists. The correct next phase is production protection and end-to-end proof.

Recommended order:

1. Accept the owner invitation and verify authenticated access to HFY OS.
2. Sign in to Squarespace, install the Resend DNS records, and verify `hearforyou.group`.
3. Upgrade the Supabase organization to Pro for seven days of daily database backups. PITR is explicitly deferred until real hotel financial data flows continuously. Steps 2 and 3 are interchangeable, but both must finish before step 5.
4. Add an infrastructure-external heartbeat/watchdog for both Vercel Cron jobs.
5. Create one controlled test Residency and billing scenario in production.
6. Run an end-to-end Invoice acceptance test:
   - Create Draft
   - Validate Shift/client totals
   - Approve
   - Generate PDF inside Vercel
   - Confirm immutable snapshot and stored file metadata
   - Download and visually inspect the PDF
   - Confirm client-only information
   - Deliver through Resend
   - Confirm idempotency and delivery status
7. After that proof, treat native invoice PDF generation as operational and continue to the next product feature.

## Priority judgment

The highest immediate risks are not missing invoice-template code. They are:

1. No usable production backup or point-in-time recovery
2. No outside detection when a Cron job silently fails to fire
3. Resend domain still awaiting DNS verification
4. No live serverless Invoice PDF acceptance test yet

RLS policies remain important hardening, but with one internal owner, no client portal, no browser-side operational data access, and an empty production database, backups, silent-automation detection, and the live Invoice acceptance test are the more urgent pre-operational priorities.

## Claude review decisions accepted

- Full agreement with the status assessment and priority order.
- DNS verification and the backup upgrade can occur in either order; both must finish before controlled production test data is created.
- Supabase Pro daily backups are sufficient for the current operating phase. PITR is deferred.
- Healthchecks.io free tier is the selected Cron watchdog, with one check per job and success-only pings.
- The RLS deferral is considered safe because the browser publishable key is used only for authentication, not direct operational-data queries.

## Requested review from Claude

Please review and answer plainly:

1. Do you agree with the status assessment above based on the repository and deployed architecture?
2. Do you agree that the Invoice PDF feature is already substantially built and now needs live acceptance rather than another long implementation session?
3. Would you change the recommended priority order?
4. Is Supabase Pro daily backup sufficient for the initial one-user operating phase, or would you require PITR now?
5. What is the lightest reliable external heartbeat design for the two Vercel Cron jobs?
6. Is there any security or data-integrity issue here that should move ahead of the controlled Invoice acceptance test?
