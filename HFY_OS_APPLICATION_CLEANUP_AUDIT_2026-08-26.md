# HFY OS application cleanup audit

**Audit date:** August 26, 2026  
**Production reviewed:** `https://hfy.app`  
**Production revision at audit:** `81ddf4d`  
**Scope:** authenticated company routes, unauthenticated routes, empty states, navigation, source-level placeholder sweep, and Vercel runtime errors.

## Executive result

The production UI is visually coherent and the primary company pages fit inside a 1280 × 720 screen without horizontal clipping. Calendar, Artist Lookup, Pipeline, Payouts, Invoices, login, password recovery, and artist onboarding all rendered. One functional production defect was found on Admin settings and was fixed, deployed, and re-tested during the same session. The remaining findings below are either activation blockers already tracked elsewhere or presentation/product decisions that were deliberately not changed without approval.

## Functional defect found and resolved

### Admin settings returns HTTP 500

- **Production behavior:** `/app/setup` renders the global error page.
- **Vercel error:** the route attempts to load `playwright-core/browsers.json`, which is absent from that server function bundle.
- **Cause:** the shared server-action module statically imported the native Invoice PDF service. Admin settings loaded the entire Playwright runtime even though the route was not approving an Invoice.
- **Fix:** Invoice approval and retry now dynamically load the Invoice service only when those actions actually run.
- **Local verification:** type-check, lint, all automated tests, and the production Webpack build pass.
- **Production resolution:** deployed in revision `2e009ae`; `/app/setup` was re-opened in production and confirmed to render successfully.

## Findings intentionally not changed

### 1. Public artist onboarding can store real W-9 files now

**Severity: high before public promotion**

`/join` is public and accepts PDF/JPG/PNG W-9 uploads up to 8 MB into the private `talent-documents` bucket. It has field validation and a honeypot, but no rate limit, CAPTCHA, invitation token, or owner approval gate before Storage is written.

Why this matters now:

- Storage backups are now operational. The remaining risk is public, unauthenticated file intake rather than absence of recovery coverage.
- An unshared public URL can still be discovered or abused.
- The page copy says it collects “booking and payment details,” but the current form collects contact/profile details and an optional W-9, not payment instructions.

Recommended decision before Friday: either temporarily gate `/join` behind an invitation token/feature flag, or explicitly accept the current exposure and add rate limiting immediately after the demo. Do not invite artists until the Storage backup has passed.

### 2. Empty Dashboard copy describes an obsolete staging approach

**Severity: presentation**

Current copy says: “No new-system Residencies yet. Ace remains operationally in Airtable; a separate parity sandbox can be added in staging.” HFY OS currently has one real environment and the plan is for the owner to create Ace directly when ready. Suggested replacement:

> No Operations Residencies yet. Create one from Admin settings when you are ready to begin setup.

### 3. Artist Lookup empty result reads as an empty search

**Severity: presentation**

With no artists, the left panel says `No artists match “”.` Suggested behavior:

- Empty roster: “No artists have been added yet.”
- Non-empty search with no result: preserve `No artists match “search term”.`

The roster import will hide the first state in normal use, but it remains part of the product’s clean-slate behavior.

### 4. Pipeline status tabs are crowded at 1280 px

**Severity: presentation**

All nine Pipeline tabs fit, but several labels and zero-count badges become very small. Suggested treatment: keep a single row, allow horizontal scrolling inside the tab strip, and retain the current selected-state styling. No workflow change is needed.

### 5. Company financial routes exist but are not in company navigation

**Severity: information architecture decision**

`/app/payouts` and `/app/invoices` both work without a Residency query parameter and show company-wide data. The company sidebar does not link to either route. This is not broken, but the discoverability and intended scope should be decided:

- Keep hidden and treat these as residency-only screens, or
- Add company-wide Payouts and Invoices navigation for cross-residency operations.

### 6. Production preview route is intentionally disabled

**Severity: informational**

`/preview` returns 404 because `HFY_DEMO_MODE` is not enabled in production. This is correct for the real environment. Friday’s demo should use real authenticated HFY OS, not the sample-data preview.

## Pages reviewed

| Route | Result | Notes |
|---|---|---|
| `/login` | Pass | Clean branded login; recovery link present. |
| `/reset-password` | Pass | Password-entry UI renders; recovery-token behavior was proven earlier. |
| `/app` | Pass | Clean company Overview; stale empty-state copy noted above. |
| `/app/calendar` | Pass | Full month fits at 1280 × 720 without page scrolling; empty company state is clear. |
| `/app/talent` | Pass | Left-list/right-detail layout is stable; empty-copy issue noted above. |
| `/app/setup` | Pass after remediation | Static Playwright dependency caused HTTP 500; revision `2e009ae` fixed and production verification passed. |
| `/app/leads` | Pass | Pipeline foundation works; tabs are crowded at 1280 px. |
| `/app/payouts` | Pass | Full-width filters/list and empty state render cleanly. |
| `/app/invoices` | Pass | Company monitoring table and empty state render cleanly. |
| `/join` | Pass with exposure noted | Public W-9 intake needs a deliberate launch posture. |
| `/hotel` | Pass | Correctly redirects to `/login`; no separate hotel portal remains. |
| `/preview` | Intentional 404 | Demo mode is disabled in production. |

## Source-level sweep

- No Meridian or Shoreline production records/copy found.
- No `TODO`, `FIXME`, `XXX`, `HACK`, fake email addresses, or sample Talent data found outside the gated preview and automated tests.
- Ace-specific sample data remains inside the gated local preview only; it is not reachable in production without `HFY_DEMO_MODE=1`.
- Internal module names still use `airtable-parity` and `parity_reconciliation`; these describe the tested business-rule source and are not user-facing placeholders.
- Invoice client PDFs remain separated from internal talent cost and gross-margin data.

## Friday demo readiness gate

Session-end demo-readiness status:

1. **Done:** Admin settings packaging fix pushed and deployed.
2. **Done:** `/app/setup` returns successfully in production.
3. **Done:** encrypted Storage backup passed once empty and again with 36 real W-9 objects; the second artifact is 16.5 MB.
4. **Done:** all 44 Airtable artists imported and compared back to Airtable; live UI spot checks passed.
5. **Owner task:** create Ace and test Daypart/calendar setup as planned; Codex did not pre-populate it.
