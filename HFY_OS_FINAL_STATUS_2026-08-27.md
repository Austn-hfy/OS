# HFY OS — final production status

**Status date:** August 27, 2026  
**Production:** https://hfy.app  
**Repository:** https://github.com/Austn-hfy/OS  
**Application revision tested:** `19e53e0`  
**Environment model:** one real production environment; no staging split yet

## Executive result

HFY OS is live at `hfy.app`, the owner login works, and the production application is operating on the real Supabase/Vercel infrastructure. The native Invoice PDF lifecycle is proven in production. Operations and Pipeline foundations are deployed. The complete 44-artist Airtable Talent roster is now in Artist Lookup, including encrypted payment data and 36 valid W-9 files. Database backups, encrypted Storage backups, Healthchecks, and deployment-failure email coverage are in place.

The one requested infrastructure item that is **not operational yet** is Sentry. The application integration is built, tested, committed, and deployed, but Sentry will not create the account/organization until the owner personally accepts its Terms/Privacy Policy and permanently selects a data region. No Sentry DSN or alert route exists until that owner-only step is completed.

No Ace Residency was created or pre-populated. No historical schedules, Invoices, or payouts were imported. No tiered-pricing or licensing work was started.

## 1. Native Invoice PDF system

**Status: complete and proven in production, except for one intentionally untested Resend delivery.**

The controlled acceptance Invoice `HFYQA-2026-0904` proved:

- native PDF generation in the real Vercel/Chromium runtime;
- fail-closed approval: validation, snapshot, generation, and Storage must succeed before status can become Approved;
- private Storage in `invoice-pdfs`;
- saved path, source hash, PDF SHA-256, byte size, canonical snapshot, version, generation timestamp, and generating user;
- authenticated PDF download through the normal application route;
- server-reported Storage metadata agreeing with the generation hash;
- locking at Approved: a second approval/generation attempt was rejected instead of silently replacing the PDF;
- client PDF separation: no talent cost, gross margin, payout, or other internal financial data appeared;
- Ace's manual-send exception remained intact.

The synthetic Residency, Artist, Shifts, Assignments, Invoice, and PDF used by the acceptance test were deleted afterward. The application remains a clean slate for real Operations data.

**Deliberately unfinished:** a real Resend delivery has not been sent. The downstream delivery implementation is present, but a controlled recipient has not been authorized. This is the only intentionally unproven part of the Invoice path; it is not masking an incomplete PDF or approval implementation.

## 2. Application feature status

| Area | Status | Production note |
|---|---|---|
| Operations mode | Built and deployed | Residency setup, Dayparts/day rules, projected calendar slots, assignments, payout lifecycle, Invoices, and per-Residency configuration are present. Real Ace setup/walkthrough is intentionally still the owner's task. |
| Residency calendar | Built and deployed | Projected color-coded Dayparts, fill-state visibility, multi-DJ assignment flow, edits/replacements, filters, and no-scroll month layout are present. Needs real Ace acceptance during the owner's walkthrough. |
| Payouts | Built and deployed | Status tabs, filtering/sorting, live payment summary, one-click Mark paid, backdating, detail drawer, and Paid-date grouping are present. |
| Invoices | Built and deployed | Scheduled and manual Invoices, per-Residency Invoice setup, PDF approval lifecycle, authenticated download, and manual/automatic delivery rules are present. |
| Pipeline mode / Leads | Built and deployed | Operations/Pipeline navigation, ordered status tabs, counts, new Lead, editable detail, notes, and in-place Won conversion foundation are present. Meetings, Rundown, and Proposal actions remain out of scope. |
| Artist Lookup | Complete and populated | Left-list/right-detail experience is live with all 44 Airtable artists, outstanding amount, owed-from detail, bookings/calendar, contact, payment summary, W-9 state, and edit action. |
| Hotel portal | Intentionally absent | The separate portal concept was explicitly abandoned for now. `/hotel` redirects to login. |
| Preview | Retired and removed | The `/preview` route, its hard-coded sample data, and the `HFY_DEMO_MODE` redirect were removed. Local development now runs the real application only. |

## 3. Airtable Talent roster import

**Status: complete, production-verified, and repeatable.**

Source:

- Base: `app7UJ081WoOWoQTS` (`HFY OS`)
- Table: `tbllqAgESyBVHrsgK` (`Talent`)
- Dedicated Airtable token: read-only scopes (`data.records:read`, `schema.bases:read`) and access restricted to this base

Import result:

- 44 of 44 artists present in production;
- 36 Active and 8 Inactive, matching Airtable;
- Airtable `Roster Status` is blank on all 44 source records and remains preserved as blank; no status was invented;
- identity, contact, Instagram, Home Market, Genres, Priority, notes, and raw Airtable status labels preserved;
- Total Outstanding Owed, Owed From, Upcoming Bookings, and Total Earnings (All Time) preserved as read-only Airtable snapshots;
- Payment Method and Zelle fields preserved;
- five ACH profiles preserved with full account name/routing/account values encrypted under AES-256-GCM and only the last four displayed;
- 36 valid PDF/JPEG W-9 files stored privately in `talent-documents`;
- each import is idempotent by Airtable record ID and creates a non-sensitive audit entry.

One source-data exception is explicit:

- Kaya (`recphgqUHBynAmr1t`) has an Airtable W-9 attachment named `view` with MIME type `text/html`. It is a webpage, not a PDF/image tax document. HFY OS did not store or serve that unsafe HTML file. Kaya's Artist record imported normally and shows no W-9 on file.

Verification was stronger than a sample-only check:

- all 44 production rows were compared directly with the live Airtable export;
- decrypted ACH values were compared internally without printing them;
- document counts were compared per artist;
- no field mismatches remained;
- direct spot-check set: Void, Hear For You, Bubba, and Bad Gal Gali;
- the same four Artist detail screens were opened in live HFY OS;
- no full ACH routing or account number is visible in Artist Lookup.

The first historical-snapshot UI pass briefly duplicated Airtable's computed `Payment Details` formula, which contains full ACH values. The live check caught it. The plaintext column was deleted from production and from the schema, the UI was redeployed, and all 44 records were re-verified. The canonical full ACH values now exist only in encrypted fields.

## 4. Monitoring and recovery

### Sentry

**Status: integration complete; account activation blocked on owner action.**

Completed in code:

- `@sentry/nextjs` installed;
- server, edge, and client instrumentation;
- Next.js request-error capture;
- global application error boundary;
- source-map configuration and required environment-variable contract;
- Sentry telemetry disabled;
- Vercel Cron monitoring left to Healthchecks to avoid duplicate mechanisms;
- typecheck, lint, tests, and production Webpack build pass;
- integration is on `main` and deployed.

Still required before Sentry is operational:

1. Owner selects US or EU data storage and accepts Sentry Terms/Privacy Policy.
2. Create the HFY organization and `hfy-os` project.
3. Add DSN, organization slug, project slug, and source-map auth token to Vercel.
4. Redeploy.
5. Trigger a controlled production error and confirm both event capture and an alert email to `austyn@hearforyou.group`.

Until those steps happen, Sentry is **not** providing live alerts and should not be described as complete.

### Healthchecks.io

**Status: complete and previously production-proven.**

- one external heartbeat for daily auto-complete;
- one external heartbeat for reconciliation;
- each handler pings only after successful completion;
- never-invoked and throw-before-finish failures become missed checks rather than false successes;
- Vercel's own deployment-failure email remains the separate deployment-level alert.

### Supabase database backups

**Status: active.**

- Supabase Pro daily database backups are enabled;
- PITR is intentionally not enabled yet, per the accepted decision;
- revisit PITR once real hotel financial data flows continuously.

### Supabase Storage backups

**Status: operational and proven with real objects.**

- daily GitHub Actions workflow at 12:20 UTC;
- covers `invoice-pdfs`, `brand-assets`, and `talent-documents`;
- recursively exports objects and a deterministic manifest;
- manifest records bucket/path, content type, size, timestamps, and SHA-256;
- export verifies every object's byte size and hash;
- archive is encrypted with AES-256-CBC/PBKDF2 before GitHub upload;
- workflow decrypts the archive and re-runs manifest verification before publishing it;
- restore command is dry-run by default and will not overwrite unless explicitly told;
- artifacts retain for 90 days.

Production proof:

- Run #1 passed with empty Storage and produced a 717-byte encrypted artifact.
- Run #2 passed after the roster import and produced a 16.5 MB encrypted artifact containing the 36 W-9 objects.
- Run #2 artifact digest: `sha256:717b4bf95fd23e5cdbfb0d2dc563699d0af4ae53578217b35123fbfeb3f5dfbf`.
- Recovery passphrase is stored outside GitHub in the owner's Mac Keychain as `HFY OS Storage Backup`.

GitHub currently emits a non-failing warning that several upstream Actions still declare Node.js 20 and are being forced onto Node.js 24. The backup itself succeeds; update those Actions when their maintainers publish fully Node-24-native versions.

## 5. RLS and data-access posture

**Status: deliberate server-enforced model; no per-Residency RLS policies yet.**

- RLS is enabled on the application tables.
- There are zero table policies, so the publishable/anon role is default-denied for application data.
- The publishable key is used in browser code only for Supabase Auth sign-in and password recovery.
- There are no browser-side `.from(...)` table queries.
- Normal application data access and Residency isolation remain in authenticated server code and the direct server database connection.
- A legacy `service_role` key was used for the controlled roster import. Database grants were added only for the server role and only to the tables required by that importer: read on `users`; read/write on `talent` and `talent_payment_profiles`; read/insert on `talent_documents`; insert on `audit_log`.
- No grants or policies were added for the anon/publishable role.

Real per-Residency RLS remains a Phase 2 hardening item before client-facing browser data access or licensable multi-customer use.

## 6. Cleanup audit

A full production and source-level audit is in `HFY_OS_APPLICATION_CLEANUP_AUDIT_2026-08-26.md`.

Resolved functional issue:

- `/app/setup` was returning HTTP 500 because a shared action module statically loaded Playwright into the Admin settings server function. Invoice approval/send services now load only when those actions are invoked. Revision `2e009ae` deployed successfully, and `/app/setup` now renders in production.

Findings deliberately reported rather than cosmetically changed:

1. `/join` is public and can accept a real W-9 without an invite token, rate limit, or CAPTCHA. Storage recovery is now covered, but abuse prevention remains a launch decision.
2. The empty Dashboard still mentions an obsolete staging/parity-sandbox approach.
3. The clean-slate Artist Lookup state says `No artists match “”.` With the real roster present, this is not visible in normal use.
4. Pipeline's nine status tabs are crowded at 1280 px.
5. Company-wide Payouts and Invoices routes work directly but are not linked from company navigation; intended information architecture still needs a decision.
6. The obsolete `/preview` demonstration and its fake data have been removed from the application.

Source sweep result:

- no Meridian or Shoreline production records/copy;
- no TODO/FIXME/XXX/HACK markers in production application code;
- no fake Talent emails/data in the application;
- no Ace Residency or operational history created during this session.

## 7. Verification and deployment evidence

- Application revision `19e53e0` is Ready in Vercel and is the runtime revision covered by the final verification. A documentation-only commit follows this report.
- Previous session commits also deployed:
  - `1a42659` — Sentry hooks and encrypted Storage backup foundation;
  - `2e009ae` — production Setup fix and roster-import foundation;
  - `cde04a2` — Airtable import and full comparison tooling;
  - `19e53e0` — removal of plaintext payment-summary duplication.
- Final local quality gate:
  - TypeScript: pass;
  - ESLint: pass;
  - automated tests: 87/87 pass across 14 files;
  - Next.js production Webpack build: pass;
  - Vercel production deployment: Ready;
  - `/app/setup`: live pass;
  - `/app/talent`: live pass, 44 artists;
  - full Airtable-to-production verification: 44/44 pass;
  - real-object encrypted Storage backup: pass.

## 8. Secure local recovery entries created

The following recovery credentials are stored in the owner's macOS Keychain, not in the repository:

- `HFY OS Storage Backup`
- `HFY OS Airtable Read Token`
- `HFY OS Supabase Backup Key`
- `HFY OS Supabase Legacy Service Role`
- `HFY OS Talent Payment Encryption Key`

The temporary invalid `HFY OS Production Database URL` Keychain entry created during troubleshooting was deleted and is not used anywhere.

## 9. Exact remaining owner/actions list

1. **Sentry:** choose the data region and accept Sentry's legal terms, then let the remaining project/env/test-error setup finish.
2. **Resend acceptance:** authorize a safe real recipient when ready; then send one controlled Invoice and verify delivery/receipt. Do not use a hotel recipient without explicit approval.
3. **Ace walkthrough:** create Ace yourself and test Residency defaults, Dayparts, calendar projection, multi-DJ assignment/editing, payout behavior, and Invoice setup. HFY OS intentionally has no Operations Residency yet.
4. **Kaya W-9:** replace the Airtable HTML `view` attachment with a real PDF/JPEG/PNG if a valid W-9 should be on file, then rerun the idempotent importer or upload it through the approved UI.
5. **Demo decision:** decide whether `/join` should be temporarily gated before it is shared publicly.

No new feature build should be selected from the roadmap until the owner has spent time in the live app and completed the planned Ace workflow walkthrough.
