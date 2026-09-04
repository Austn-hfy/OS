# Platform Billing — Staging Runbook

This integration is staging-only and Stripe test-mode-only. The server validates `sk_test_` and `pk_test_` prefixes before constructing the Stripe client, rejects Stripe objects or events with `livemode: true`, and rejects Vercel production execution.

## Billing contract

- The Committed Plan is the only billing input. It stores Talent-session count, House-program count, monthly one-off allowance, one per-unit monthly rate, cadence, start date, renewal date, and an immutable revision history.
- Live Usage is calculated independently from active Daypart data. Active standing Talent Daypart weekday rules count as Talent sessions; distinct active standing House Dayparts count as House programs; calendar-only Dayparts with a real shift or schedule occurrence in the current month count against the one-off allowance.
- Live Usage can create a timestamped overage event and an owner attention item. It cannot edit a Committed Plan, update a Stripe Price, create an invoice item, block the portal, or initiate a charge.
- A manual Committed Plan update changes the existing Stripe subscription item. Same-cadence changes use no proration. Cadence changes are scheduled on the same subscription at its renewal boundary.
- Platform subscription invoices use their own database ledger and PDF template. They never enter the HFY Talent invoice ledger.

## Additive migration

Apply `drizzle/0042_platform_billing_system.sql` to the staging database before deploying the application. The billing migration was originally authored as 0040, but staging already contained unrelated migrations 0040 and 0041 when activation began, so it is intentionally sequenced as 0042. It:

1. Extends the existing Platform subscription and invoice tables without deleting legacy data.
2. Backfills the unified unit rate and plan dates for existing records.
3. Creates immutable plan revisions, daily usage snapshots, overage events, a test-only webhook event ledger, and a durable alert outbox.
4. Adds Residency-scope triggers, constraints, indexes, row-level security, and deny-by-default client privileges.

The migration was verified from migration 0000 through 0042 in the PGlite database constraint suite.

## Staging configuration

Set these only in the staging/preview environment:

```text
NEXT_PUBLIC_APP_URL=https://staging.hfy.app
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
PLATFORM_BILLING_OWNER_EMAIL=<owner billing address>
PLATFORM_BILLING_TEST_RECIPIENT_EMAIL=<controlled test inbox>
PLATFORM_BILLING_FROM_EMAIL=<verified staging sender>
PLATFORM_BILLING_REPLY_TO=<staging reply-to>
PLATFORM_BILLING_LEGAL_NAME=HFY LLC
PLATFORM_PRODUCT_NAME=Platform
PLATFORM_BILLING_ADDRESS=<invoice address>
```

Staging records separate intended owner and hotel notifications, but the dispatcher sends both to `PLATFORM_BILLING_TEST_RECIPIENT_EMAIL`. This prevents a staging failure simulation from contacting a real hotel.

Create a Stripe test-mode webhook endpoint at:

```text
https://staging.hfy.app/api/stripe/webhook
```

Subscribe it to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `customer.subscription.paused`
- `customer.subscription.resumed`
- `invoice.finalized`
- `invoice.payment_failed`
- `invoice.payment_succeeded`
- `invoice.paid`
- `invoice.voided`
- `invoice.marked_uncollectible`
- `invoice.updated`

Vercel runs `/api/cron/platform-billing` daily. The job refreshes usage snapshots, records or resolves overages, queues the monthly owner heads-up on or after the 25th, and retries unsent test alerts.

## Verification

Run:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm pdf:sample:platform
pnpm stripe:verify:platform -- --apply
```

The disposable Stripe verifier uses Stripe's `pm_card_visa` fixture (the code-test equivalent of card `4242 4242 4242 4242`) for successful recurring payment and `pm_card_chargeCustomerFail` (the code-test equivalent of `4000 0000 0000 0341`) for an attached-card failure. It validates a paid initial invoice, an amount update on the same subscription ID, a quarterly cadence schedule on that same subscription, and the expected card decline. It then cancels/deactivates its disposable test records.

The sample Platform invoice is written to `output/pdf/HFY-SAMPLE-PLATFORM-INVOICE.pdf` and must be visually reviewed after template changes.
