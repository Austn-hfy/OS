# HFY OS Pilot — Launch Execution Checklist

> **Current pilot deployment decision (August 26, 2026):** use one owner-only production environment. The staging/production split in the original plan below is intentionally deferred until HFY OS becomes customer-facing, onboards a second live hotel, or becomes licensable. For the current pilot, execute the production controls once against the single Supabase and Vercel projects and run acceptance checks with controlled data.

**Prepared:** August 21, 2026  
**Status:** Launch handoff for discussion and execution  
**Scope authority:** [`PILOT_SCOPE.md`](PILOT_SCOPE.md)

## 1. RLS decision and Phase 2 roadmap

The current Row Level Security design is intentional for Phase 1.

RLS is enabled on every business table with no client policies. This causes direct Supabase Data API access by `anon` and `authenticated` clients to be denied by default. HFY OS uses Supabase Auth to establish identity, then performs business-data access through trusted server-side Drizzle queries. The privileged server database connection bypasses RLS, so Residency isolation inside the application is enforced by authenticated server code and membership-derived scope—not by user-supplied Residency identifiers.

This is an acceptable controlled-pilot tradeoff because:

- The browser uses Supabase only for authentication.
- The browser has no direct business-table data path.
- The service-role key and database connection remain server-only.
- Hotel scope comes from the authenticated user's single active Residency membership.
- RLS without policies blocks direct browser-key/PostgREST bypass.
- The database independently enforces critical scheduling, financial, and cross-Residency constraints.

Supabase documents that RLS should be enabled on exposed-schema tables and that privileged service/database roles may bypass it: [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).

### Phase 2 defense-in-depth

Real per-Residency RLS remains a Phase 2 hardening item. It requires more than adding policies because the verified user and Residency context must be made available to every database transaction.

Phase 2 should include:

- A restricted runtime database role instead of the database owner.
- Transaction-scoped user, role, and Residency claims derived from the verified session.
- Residency policies on hotel-visible tables.
- Explicit denial of financial, payout, and sensitive Talent tables to hotel roles.
- Separate trusted permissions for automation jobs.
- Revocation of unnecessary grants and possible removal of unused Data API exposure.
- Integration tests executed as the real hotel and automation database roles.

This hardening is not a blocker for the controlled pilot.

## 2. Deployment architecture

Use two completely separate Supabase projects:

- `hfy-os-staging`
- `hfy-os-production`

Use two separate Vercel projects connected to the same private source repository:

- `hfy-os-staging`
- `hfy-os-production`

This is preferable to relying on a single Vercel project's Preview environment because Vercel invokes configured Cron Jobs only for production deployments. Two projects allow the actual hourly automations to run in staging before production launch. Vercel Hobby permits Cron Jobs only once per day; the checked-in hourly schedules require Pro.

References:

- [Vercel Cron quickstart](https://vercel.com/docs/cron-jobs/quickstart)
- [Vercel Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)

Ace Hotel remains entirely in Airtable and is not read, written, migrated, synchronized, or dual-written during this rollout.

## 3. Execution order

### Step 1 — Private source control

#### Required from Aus

- GitHub username or organization.
- Approval to create a private repository.
- Repository name, recommended: `hfy-os`.

#### Execution

1. Initialize and verify the local Git repository.
2. Confirm `.env`, build artifacts, dependency stores, and credentials are ignored.
3. Commit the reviewed pilot implementation.
4. Create the private GitHub repository.
5. Push the initial release branch.
6. Use the repository as the deployment source for both Vercel projects.

#### Completion gate

- The private repository contains the reviewed source, migrations, tests, documentation, package manifest, and lockfile.
- No secrets or generated dependency/build directories are committed.

Reference: [Vercel Git deployments](https://vercel.com/docs/git).

### Step 2 — Staging Supabase project

#### Required from Aus

- Access to the HFY Supabase organization through an authenticated browser session.
- Preferred region; choose the closest appropriate US West region available.
- Permission to create `hfy-os-staging`.
- A strong database password stored in a password manager, not in chat or Git.
- One controlled email address for staging access.

#### Execution

1. Create `hfy-os-staging`.
2. Disable public user signups and anonymous sign-ins.
3. Configure the staging application URL in Supabase Auth settings after Vercel assigns it.
4. Record the following securely:
   - Project URL.
   - Publishable key.
   - Service-role key.
   - Direct or session-pooler migration connection string.
   - Transaction-pooler runtime connection string.
5. Apply the checked-in Drizzle migrations.
6. Run the Storage bootstrap script.
7. Confirm these private buckets exist:
   - `invoice-pdfs`
   - `talent-documents`
   - `brand-assets`
8. Confirm RLS is enabled on every business table and no client-access policies exist.
9. Provision the staging internal-admin login.

#### Connection rule

- Use the direct connection for migrations when reachable.
- Use Supavisor session mode for migrations if the machine cannot reach the direct IPv6 endpoint.
- Use Supavisor transaction mode on port `6543` for Vercel runtime traffic.
- Prepared statements must remain disabled in transaction mode; the application already does this.

#### Completion gate

- All migrations succeed on an empty staging database.
- All three Storage buckets are private.
- Public signup is disabled.
- The admin can sign in, and a non-provisioned Auth identity cannot enter either application area.

References:

- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase Auth configuration](https://supabase.com/docs/guides/auth/general-configuration)

### Step 3 — Resend and DNS

#### Required from Aus

- Access to the HFY Resend account.
- Access to the DNS provider controlling `hearforyou.group`.
- Confirmation that `billing@hearforyou.group` exists and is monitored.
- A controlled inbox for staging invoice delivery.

#### Recommended configuration

- Verify `hearforyou.group` so the sender can remain `HFY Billing <billing@hearforyou.group>`.
- Keep `billing@hearforyou.group` as the Reply-To address.
- Add the exact SPF and DKIM records generated by Resend.
- Add DMARC when appropriate as an additional trust measure.
- Create separate send-only API keys for staging and production.
- Use only a controlled HFY inbox as the staging billing recipient.

#### Execution

1. Add `hearforyou.group` to Resend.
2. Add Resend's generated DNS records at the authoritative DNS provider.
3. Wait for the domain to reach `verified` status.
4. Create a send-only staging API key.
5. Create a separate send-only production API key.
6. Store each key only in its matching Vercel project/environment.
7. Confirm the sender domain exactly matches the verified domain.

#### Completion gate

- Resend reports the domain as verified.
- `billing@hearforyou.group` can receive replies.
- A controlled test message arrives successfully.
- The staging and production API keys are distinct.

References:

- [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction)
- [Resend API-key permissions](https://resend.com/docs/api-reference/api-keys/create-api-key)

### Step 4 — Staging Vercel deployment

#### Required from Aus

- Access to the HFY Vercel team.
- Confirmation that the team uses Vercel Pro.
- Approval to create `hfy-os-staging`.
- Optional staging domain; the generated Vercel URL is sufficient.

#### Execution

1. Import the private GitHub repository into a new `hfy-os-staging` Vercel project.
2. Confirm Vercel detects Next.js.
3. Configure the following staging environment variables:
   - `DATABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY`
   - `INVOICE_FROM_EMAIL`
   - `INVOICE_REPLY_TO`
   - `CRON_SECRET`
   - `NEXT_PUBLIC_APP_URL`
4. Use the staging Supabase transaction-pooler string for `DATABASE_URL`.
5. Generate a unique, random staging `CRON_SECRET`.
6. Deploy the project.
7. Set the deployed URL in `NEXT_PUBLIC_APP_URL` and Supabase Auth settings, then redeploy if necessary.
8. Confirm Vercel registers both Cron Jobs:
   - `/api/cron/auto-complete` at the top of each hour.
   - `/api/cron/reconcile` at 15 minutes past each hour.
9. Inspect deployment and function logs for configuration or connection errors.

#### Completion gate

- The staging login page loads over HTTPS.
- Unauthenticated protected routes redirect to login.
- The internal admin can sign in.
- Both Cron Jobs appear in the Vercel project and receive authenticated invocations.

Reference: [Vercel environment variables](https://vercel.com/docs/environment-variables).

### Step 5 — Seed and exercise staging

#### Required from Aus

- Admin display name and email.
- Two controlled hotel-test email addresses or aliases.
- A disposable staging DJ identity.
- Permission to send test invoices to a controlled inbox.

#### Staging setup

Create two synthetic Residencies so isolation can be exercised end-to-end:

- Test Hotel A.
- Test Hotel B.

Create one shared staging DJ and approve that DJ separately for both Residencies. Create covering Invoice periods before creating Shifts so Shift-to-Invoice linking can be tested through the normal application path.

#### Booking and payout acceptance cycle

1. Sign in as Hotel A.
2. Confirm only Hotel A's calendar and approved DJ list appear.
3. Submit a DJ and time selection.
4. Confirm the Assignment appears internally as `Pending HFY Confirmation`.
5. Confirm the Assignment as HFY.
6. Allow the service date to pass and invoke/observe the daily automation after 6:00 a.m. in the Residency's timezone.
7. Confirm the Assignment becomes `Completed`.
8. Confirm it enters `Ready to Pay` when financially eligible.
9. Record payment with date, amount, and reference.
10. Confirm the Assignment becomes `Paid` and retains the recorded payment details.

#### Invoice acceptance cycle

1. Create an Invoice covering the test Shift's service date.
2. Create the Shift and confirm it links to the unique covering Invoice.
3. Confirm the approved total exactly matches the Shift service hours multiplied by the client rate.
4. Approve the Invoice and confirm native PDF generation succeeds before the status changes.
5. Open the stored PDF and confirm it includes only client billing details, with no artist, payout, or internal margin data.
6. Confirm exactly one email arrives in the controlled inbox.
7. Retry delivery and allow reconciliation to run.
8. Confirm no duplicate email is sent.
9. Confirm the PDF checksum/snapshot, Resend message ID, delivery state, and Invoice sent time are recorded.

#### Isolation and constraint cycle

1. Confirm Hotel A never sees Hotel B data.
2. Confirm Hotel B never sees Hotel A data.
3. Create overlapping Shifts at both hotels.
4. Submit the shared DJ for Hotel A.
5. Attempt the overlapping DJ selection from Hotel B.
6. Confirm the second selection is rejected.
7. Attempt direct Supabase Data API table access using a browser-safe key and confirm no business data is returned.
8. Attempt an Assignment outside its parent Shift and confirm the database rejects it.
9. Attempt a Shift-to-Invoice link across Residencies and confirm the database rejects it.

#### Completion gate

- The full booking, confirmation, completion, payout, invoice, and email sequence succeeds.
- Exactly one invoice email is sent.
- Cross-Residency visibility and conflicting booking attempts fail.
- All automated tests, typecheck, lint, and production build remain green against the release commit.

### Step 6 — Production infrastructure

Production begins only after staging passes.

#### Required from Aus

- Approval to create `hfy-os-production` in Supabase and Vercel.
- Production domain choice, recommended: `os.hearforyou.group`.
- DNS access for the application domain.
- Confirmation of the production administrator identity.

#### Execution

1. Create an empty `hfy-os-production` Supabase project.
2. Disable public signup and anonymous sign-ins.
3. Apply the same checked-in migrations.
4. Bootstrap the same three private Storage buckets.
5. Create `hfy-os-production` in Vercel.
6. Configure production-only Supabase, Resend, and Cron secrets.
7. Attach `os.hearforyou.group` or the final approved domain.
8. Configure the production URL in Supabase Auth settings.
9. Provision only the internal administrator initially.
10. Confirm production login and both Cron Jobs without adding hotel data.

#### Completion gate

- Production is clean and separate from staging.
- No staging data or credentials exist in production.
- The production administrator can sign in.
- The production domain, HTTPS, database, private Storage, and Cron Jobs are healthy.

### Step 7 — First real hotel

#### Required from Aus

- Client account name.
- Residency name.
- City and state.
- IANA timezone, such as `America/Los_Angeles`.
- Service tier: Operations Only or Complete.
- Default DJ hourly rate.
- Client hourly rate.
- Invoice prefix.
- Payment terms in days.
- Billing contact name and email.
- Whether approved Invoices should auto-send.
- Initial shared Talent roster entries.
- The Residency's approved DJ list.
- First Invoice period, number, date, description, and approved total.
- Initial Shift names, rooms, service dates, and local start/end times.
- Hotel login email and display name.

#### Execution

1. Create the Client Account and Residency.
2. Add or select Talent records.
3. Approve the Residency-specific DJ list.
4. Create the first covering Invoice period.
5. Create the first Shifts and confirm automatic Invoice linking.
6. Provision the hotel's single-Residency login.
7. Generate a long random password.
8. Deliver the password through a password manager or secure sharing mechanism, not ordinary chat.
9. Conduct a brief hotel-user walkthrough:
   - Sign in.
   - View calendar.
   - Select approved DJ.
   - Select start and end time.
   - Submit for HFY confirmation.
10. Confirm the first real request reaches the internal queue.

#### Completion gate

- The hotel can perform the exact four authorized actions and nothing else.
- The first request appears as `Pending HFY Confirmation`.
- No rates, payouts, invoices, internal notes, or other Residency data are visible.
- HFY can continue the request through confirmation and the existing operational workflow.

## 4. Secrets and credential handling

Do not place any of the following in chat, Git, screenshots, or documentation:

- Supabase database passwords or connection strings.
- Supabase service-role keys.
- Resend API keys.
- Vercel access tokens.
- `CRON_SECRET` values.
- Admin or hotel passwords.

Secrets should be entered directly into the applicable dashboard, local ignored environment file, or password manager. Browser-safe Supabase publishable keys may appear in client configuration, but server-only credentials must never use the `NEXT_PUBLIC_` prefix.

## 5. Initial information request

Aus can provide the following non-secret information to begin execution:

```text
GitHub owner:
Repository name: hfy-os
Vercel team:
Vercel Pro confirmed: yes/no
Supabase organization:
Preferred Supabase region:
DNS provider:
Production domain: os.hearforyou.group
Admin name:
Admin email:
Staging test email(s):
Resend sender: billing@hearforyou.group
Resend reply-to:
```

Database passwords, API keys, service-role keys, Cron secrets, and user passwords must be handled separately and securely.

## 6. Two-week critical path

The final pilot remains realistic within two weeks if account and DNS access are available promptly.

| Window | Target outcome |
|---|---|
| Days 1–2 | Private repository, staging Supabase, Resend DNS verification started |
| Days 2–4 | Staging Vercel deployment, admin provisioning, synthetic Residency setup |
| Days 4–6 | Booking/payout, Invoice delivery, Cron, and isolation acceptance cycles |
| Days 6–8 | Production Supabase/Vercel setup and production smoke testing |
| Days 8–10 | First real Residency configuration and operator acceptance testing |
| Days 10–14 | Operational buffer, internal walkthrough, monitored first scheduling cycle |

The schedule assumes no delay obtaining Supabase, Vercel, Resend, GitHub, or DNS access. Ace migration is not part of this schedule.
