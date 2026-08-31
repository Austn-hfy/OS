# HFY OS staging environment

HFY OS has two deliberately separate deployed environments. Staging is the review surface for changes before they reach the live application.

## Environment map

| Environment | Git branch | Application | Supabase project | Data policy |
| --- | --- | --- | --- | --- |
| Production | `main` | `https://hfy.app` | `tkfsgifnywbwjdkxjhae` | Real operational data |
| Staging | `staging` | `https://hfy-os-git-staging-austyn-7123.vercel.app` | `ucrtbevvdfkceudknyxe` | Empty or synthetic test data only |

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

The staging owner is `austyn@hearforyou.group`. Use the staging login page and its password-recovery flow if a new password is needed. Staging must not contain Ace, Michael, or any other production customer records. Use clearly labeled synthetic fixtures and remove them when their test is complete.

## Rollback

- For a staging-only problem, revert the staging commit or redeploy the last known-good staging deployment. Production is unaffected.
- For a database problem, prefer a forward corrective migration. Do not reuse production backups in staging.
- Production rollback remains a separate, deliberate action and is never triggered by changes to `staging`.

