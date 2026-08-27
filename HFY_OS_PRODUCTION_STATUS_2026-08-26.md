# HFY OS — Production Status and Priority Review

**Status date:** August 26, 2026  
**Production application:** https://hfy.app  
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
- Supabase now records that owner as confirmed, with a successful sign-in on August 26, 2026.
- Both Vercel Cron endpoints were previously invoked manually and returned HTTP 200.

## Resend and authentication email setup

`hearforyou.group` is verified in Resend. The required DKIM and sending CNAME records were added through Squarespace without changing the existing website, forwarding, or Google Workspace records.

Supabase Auth now uses a dedicated Resend SMTP credential with Sending access. The sender is `auth@hearforyou.group`, and a fresh HFY OS password-reset email was delivered successfully. The owner set a password and signed into the production application successfully.

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

The Chromium dependency packages and deploys successfully on Vercel. A controlled production fixture was created and a real Invoice PDF was rendered inside the deployed Vercel runtime on August 26, 2026.

Verified from the deployed serverless runtime:

- Chromium generated a valid, tagged, one-page Letter PDF.
- The downloaded file was 45,560 bytes and its local SHA-256 matched the server response metadata.
- The PDF grouped four scheduled services under Friday and Saturday, with daily subtotals and a $2,000 total.
- Visual review found no clipping, overlap, broken glyphs, or layout defects.
- Text and visual inspection confirmed that the document contains no artist identity, talent cost, payout details, gross margin, Zelle/payment information, internal notes, or other internal-only fixture markers.

The full fail-closed Approval transaction is now complete. After replacing Vercel's Storage credential with the correct legacy JWT-format `service_role` key, production approved `HFYQA-2026-0904`, stored its immutable PDF, and resolved the earlier failure Attention item.

Verified production result:

- Invoice status: Approved
- Version: 1
- Storage object: present in `invoice-pdfs`
- PDF byte size: 45,560 bytes in both the Invoice record and Storage metadata
- Source hash: stored
- PDF SHA-256: stored
- Canonical snapshot: stored as an object
- Generated timestamp and generating user: stored
- Approval audit entry: present
- Prior PDF-generation Attention item: resolved
- Invoice deliveries: 0
- Auto-send: disabled
- Resend invoice calls: 0
- Authenticated Download PDF action: starts successfully

The browser security boundary did not permit automation to extract the downloaded file's local path, so this session did not recompute SHA-256 from the authenticated download bytes. No workaround was attempted. The stored object exists and its 45,560-byte size matches the immutable Invoice metadata.

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

The Supabase organization is now on the Pro plan.

Verified state:

- Scheduled project backups: **active**
- Verified backup entry: August 26, 2026 at 19:09:35 UTC
- Point-in-time recovery: **not configured**, by deliberate decision

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

The Healthchecks.io account is active under `austyn@hearforyou.group`. Both checks are configured in UTC with two hours of grace for Vercel Hobby's flexible execution window:

- Auto-complete: `0 12 * * *`
- Reconciliation: `15 12 * * *`

Both private success URLs are stored as Vercel Production secrets. Commit `a1a39cb` is deployed, and both production handlers were manually invoked after deployment. Both Healthchecks.io checks received the expected success pings and currently show **up**.

The active production schedules are:

- `/api/cron/auto-complete` — daily at `0 12 * * *`
- `/api/cron/reconcile` — daily at `15 12 * * *`

Both are enabled and have successfully returned HTTP 200 when manually invoked. However:

- Vercel Hobby provides a flexible one-hour execution window.
- Vercel does not retry a failed Cron invocation.
- Logs can show a failed request after the fact.
- Healthchecks.io now detects a job that never fires or never reaches successful completion and emails the owner after the configured grace period.
- HFY OS still cannot create its own in-app Attention item when Vercel never invokes a job; the external Healthchecks alert is the protection for that case.

Reference: https://vercel.com/docs/cron-jobs/manage-cron-jobs

## Production data state

After the controlled Invoice acceptance proof was completed and the owner explicitly approved cleanup, production contains:

- Operations Residencies: 0
- Pipeline Leads: 0
- Artists: 0
- Invoices: 0
- Invoice PDFs in Storage: 0
- Synthetic acceptance-test records: 0

Ace remains outside this production database and continues operating in Airtable, as planned.

## Recommended priority order

The next work should **not** be framed as building invoice PDF generation from scratch. The template, canonical snapshot, Vercel/Chromium rendering, fail-closed Approval flow, storage metadata, download route, and Resend delivery path already exist. Real Vercel PDF generation and client-content acceptance have now been proven.

Recommended order:

1. Design a separate export/backup plan for Supabase Storage objects before real hotel documents become irreplaceable.
2. Run a controlled invoice-delivery/idempotency test only after explicitly selecting a safe recipient and authorizing the send.
3. Add full Residency-scoped RLS policies during the planned Phase 2 hardening pass.

## Priority judgment

The key-format blocker, stored-PDF acceptance, Resend domain verification, custom Auth SMTP, owner login, daily backups, and Cron monitoring are complete. The remaining infrastructure gap is a separate backup/export strategy for Storage objects, because Supabase database backups cover Storage metadata but not the files themselves.

RLS policies remain important hardening, but with one internal owner, no client portal, no browser-side operational data access, and only isolated synthetic acceptance data in production, the current default-deny posture remains acceptable for this phase.

## Claude review decisions accepted

- Full agreement with the status assessment and priority order.
- DNS verification and the backup upgrade were interchangeable infrastructure steps. Supabase Pro and daily backups are now active; Resend DNS remains required before any delivery test, but it did not block the no-send PDF-generation acceptance proof.
- Supabase Pro daily backups are sufficient for the current operating phase. PITR is deferred.
- Healthchecks.io free tier is the selected Cron watchdog, with one check per job and success-only pings.
- The RLS deferral is considered safe because the browser publishable key is used only for authentication, not direct operational-data queries.

## Execution update

Completed after Claude's review:

- Verified the publishable key is used client-side only for Supabase Auth password sign-in.
- Added success-only Healthchecks.io pings to both Cron handlers.
- Added automated tests for configured, missing, and failed Healthchecks pings.
- Passed 75 tests, TypeScript checking, lint, and the production build.
- Created and configured both Healthchecks.io checks.
- Stored both private check URLs in Vercel Production.
- Deployed commit `a1a39cb` and confirmed both live jobs ping successfully.
- Used the repository's existing local deployment credential; no new GitHub credential was created.
- Confirmed Supabase Pro is active and a daily backup exists.
- Confirmed the owner account is accepted and has signed in successfully.
- Created one isolated controlled Residency, synthetic Artist, four scheduled Shifts, four internal Assignments, and one $2,000 Draft Invoice with auto-send disabled.
- Generated and downloaded a real Invoice PDF from Vercel's Chromium runtime.
- Verified the PDF's byte size, SHA-256, visual rendering, date grouping, totals, and client-only content.
- Confirmed Supabase Storage rejected the upload with `Invalid Compact JWS`; fail-closed behavior preserved the Draft and prevented Resend delivery.
- Replaced the Vercel Storage credential with the correct legacy JWT-format `service_role` key and redeployed.
- Added the three required Resend DNS records through Squarespace and verified `hearforyou.group`.
- Created a dedicated send-only Resend SMTP credential and configured Supabase Auth custom SMTP.
- Delivered one fresh password-reset email; the owner set a password and signed into `https://hfy.app` successfully.
- Approved `HFYQA-2026-0904` through the production HFY OS interface.
- Confirmed the immutable PDF path, source hash, SHA-256, 45,560-byte size, canonical snapshot, version, timestamp, generating user, Storage object, and approval audit entry.
- Confirmed the earlier failure Attention item is resolved, auto-send remains disabled, Invoice Delivery count is zero, and Resend was not called for the Invoice.
- Confirmed the Approved Invoice exposes only Download PDF in the production UI; the server-side approval path also rejects any non-Draft Invoice.
- After explicit owner approval, deleted the exact synthetic Client Account, Residency, Artist, four Shifts, four Assignments, Invoice, resolved Attention item, three fixture audit rows, and stored PDF.
- Re-ran production verification and confirmed zero matching database records and zero matching Storage objects; the live Overview again shows no new-system Residencies.

Still requiring fresh user approval:

- Enable or test Invoice delivery through Resend with a specifically approved safe recipient.

## Current review questions

1. What Storage-object backup/export cadence should be adopted before real hotel documents become irreplaceable?
2. When a controlled delivery test is authorized, which safe recipient should receive it?
