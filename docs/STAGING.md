# HFY OS staging environment

HFY OS has two deliberately separate deployed environments. Staging is the review surface for changes before they reach the live application.

## Environment map

| Environment | Git branch | Application | Supabase project | Data policy |
| --- | --- | --- | --- | --- |
| Production | `main` | `https://hfy.app` | `tkfsgifnywbwjdkxjhae` | Real operational data |
| Staging | `staging` | `https://staging.hfy.app` | `ucrtbevvdfkceudknyxe` | Synthetic test data, including approved sanitized production-structure copies |

The Vercel project is shared, but every database, Auth, Storage, URL, encryption, and delivery-sensitive variable used by `staging` is a branch-scoped override. Staging does not use production's Supabase project. Resend delivery and production Healthchecks are not connected to staging.

Secret values live only in the service dashboards. Do not commit them to this repository or copy them into documentation.

## Normal working rhythm

1. Start from the current `staging` branch and make the intended change locally.
2. Run focused checks while iterating.
3. When the change is ready for review, run the complete local gate: typecheck, lint, tests, and production build.
4. Push `staging`. Vercel updates the stable staging URL automatically.
5. Review and approve the change on staging.
6. Open or update the pull request from `staging` into `main`.
7. Apply any pending migrations to production as an explicit promotion step.
8. Merge the pull request. Vercel then deploys `main` to production exactly as it does today.

Do not merge the staging pull request merely to refresh staging. Pushing `staging` is sufficient.

## Database migrations

Supabase staging and production are independent projects. A migration recorded in one project has not run in the other.

- Apply new migrations to staging first and verify them there.
- Keep the checked-in migration files identical across branches.
- Before merging into `main`, apply the same pending migrations to production in order.
- Never point a staging migration command at the production connection string.
- Storage buckets and Auth callback settings are also project-specific and must be configured separately when those requirements change.

## Access and data

The staging owner is `austyn@hearforyou.group`. Use the staging login page and its password-recovery flow if a new password is needed.

Staging must never contain raw production customer data. This prohibition includes real customer authentication users, memberships, setup tokens, contact details, delivery endpoints, artist contact details, payment or ACH values, tax documents, private notes, Stripe identifiers, Shifts, Assignments, payouts, invoices, and public-calendar tokens.

An operator may copy a selected production Residency's **structure** into staging with the guarded sync command documented below. This is a deliberate refinement of the original no-production-data rule: schedules and approved public-facing roster structure may be represented for realistic testing only after every sensitive field is excluded at the source query or replaced with a clearly synthetic equivalent. Existing synthetic Residencies such as Test 1 and Test 2 remain outside the selected scope and must not be modified.

## On-demand production-structure sync

The normal owner workflow is available only at `staging.hfy.app` under **Developer Platform → Admin Settings → Sync Production Structure**. The owner first selects **Preview Sync**, reviews the exact counts, confirms the preview, and then selects **Sync Ace Now**. The preview expires after ten minutes and becomes invalid immediately if the source or destination plan changes. The card shows the last successful dashboard sync.

The dashboard action has no scheduled trigger and adds no work to ordinary application requests. It is hidden outside the stable `staging` branch, its server endpoint rejects every hostname except `staging.hfy.app`, and every request rechecks the signed-in `internal_admin` role. The production connection authenticates as `hfy_staging_structure_reader`, a dedicated role that has no table permissions and can execute only `private.hfy_staging_structure_snapshot(text)`. That function returns an allowlisted structural document and never selects raw contact, banking, tax-file, note, authentication, booking, payout, Invoice, or share-link data.

The original operator command remains available as a recovery and audit path. Production can be read through an approved database transaction, through the source-only Supabase API adapter, or from a reviewed project-bound snapshot. Only the separate staging database may receive writes.

Provide these secrets through the operator environment; do not put them in command arguments, logs, documentation, or committed files:

- `PRODUCTION_SYNC_DATABASE_URL`: approved production Postgres connection (preferred), or `PRODUCTION_SYNC_SUPABASE_URL` plus either `PRODUCTION_SYNC_SERVICE_ROLE_KEY` or `PRODUCTION_SYNC_SERVICE_ROLE_KEY_FILE` for the source-only API adapter.
- `STAGING_SYNC_DATABASE_URL`: approved staging Postgres connection.
- `STAGING_SYNC_PAYMENT_ENCRYPTION_KEY`: staging's payment-field encryption key, required only when applying synthetic payment profiles.

The staging web deployment instead uses these server-only variables:

- `PRODUCTION_SYNC_DATABASE_URL`: the dedicated `hfy_staging_structure_reader` production connection, configured only on the stable staging branch.
- `DATABASE_URL`: the existing staging database connection.
- `TALENT_PAYMENT_ENCRYPTION_KEY`: the staging encryption key for synthetic payment profiles.
- `STAGING_SYNC_CONFIRMATION_SECRET`: a staging-only secret used to sign short-lived reviewed previews.

None of these variables is exposed to browser JavaScript. The cross-environment reader connection and preview-confirmation secret must never be configured on the production deployment.

Preview an Ace refresh without writing anything:

```bash
pnpm staging:sync-from-production -- --residency ace-hotel
```

If the production database password is intentionally unavailable to the operator, the same command can consume a reviewed, project-bound structural snapshot exported through the Supabase SQL editor:

```bash
pnpm staging:sync-from-production -- --residency ace-hotel --production-snapshot-file /secure/temporary/ace-structure.json
```

The snapshot must identify the approved production project and its Residency scope must exactly match every `--residency` argument. Keep it outside the repository and delete it after the reviewed apply.

After reviewing that report, apply the same scoped refresh:

```bash
pnpm staging:sync-from-production -- --residency ace-hotel --apply
```

The command is repeatable and deterministic. It refreshes the selected Residency's configuration, Dayparts, weekly Day Rules, single-date exceptions, assigned sanitized artists, and roster-assignment visibility. It deactivates staging-only Dayparts and roster assignments only inside the selected Residency; it does not hard-delete them or touch any other Residency.

An all-Residency run is deliberately difficult to invoke and is never the default:

```bash
pnpm staging:sync-from-production -- --all --confirm-all-residencies
```

Add `--apply` only after reviewing the all-Residency dry-run. This is still a scoped refresh of each selected Residency, not a staging database wipe.

## Rollback

- For a staging-only problem, revert the staging commit or redeploy the last known-good staging deployment. Production is unaffected.
- For a database problem, prefer a forward corrective migration. Do not reuse production backups in staging.
- Production rollback remains a separate, deliberate action and is never triggered by changes to `staging`.
