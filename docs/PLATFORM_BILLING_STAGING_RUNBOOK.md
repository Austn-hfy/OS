# Platform Billing — Staging Runbook

This integration is staging-only and Stripe test-mode-only. The server validates `sk_test_` and `pk_test_` prefixes before constructing the Stripe client, rejects Stripe objects or events with `livemode: true`, and rejects Vercel production execution.

## Billing contract

- The Committed Plan is the only billing input. It stores a standard Talent bucket (10/20/30/40/50/60), a House bucket (5/10/15), the fixed $30 slot rate, a month-to-month or annual term, plan dates, and an immutable revision history.
- Annual plans are paid upfront at 25% off the twelve-month total. If cancelled early, the refund is the annual amount paid minus the months used at the full month-to-month bucket rate. Month-to-month plans have no commitment or refund calculation.
- Live Usage is calculated independently from active Daypart data and compared with the selected Talent and House buckets. There is no one-off usage metric.
- Live Usage can create a timestamped overage event and an owner attention item. It cannot edit a Committed Plan, update a Stripe Price, create an invoice item, block the portal, or initiate a charge.
- A manual Committed Plan update creates a new immutable bucket-derived Stripe Price and changes the existing Stripe subscription item. Same-term changes use no proration. Term changes are scheduled on the same subscription at its renewal boundary.
- Platform subscription invoices use their own database ledger and PDF template. They never enter the HFY Talent invoice ledger.

## Additive migration

Apply the migration series through `drizzle/0051_platform_billing_buckets_v14.sql` before deploying the application. Main's shift-change-request migrations occupy 0042–0044, the Platform billing series begins at 0045, and migration 0051:

1. Aborts before schema changes if a legacy row exceeds 60 Talent or 15 House slots.
2. Rounds legacy counts upward to the nearest standard bucket, with minimums of 10 Talent and 5 House.
3. Replaces raw rates/counts, cadence, one-off allowance, commitment windows, and tier clawbacks with v14 buckets, terms, fixed rate, and annual refund records.
4. Preserves stored invoice snapshot JSON and existing PDFs; only new snapshots use schema version 4.

The migration is verified from migration 0000 through 0051 in the PGlite database constraint suite.

## Staging configuration

Set these only in the staging/preview environment:

```text
NEXT_PUBLIC_APP_URL=https://staging.hfy.app
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
STAGING_EMAIL_RECIPIENT_OVERRIDE=<controlled test inbox>
PLATFORM_BILLING_OWNER_EMAIL=<owner billing address>
PLATFORM_BILLING_FROM_EMAIL=<verified staging sender>
PLATFORM_BILLING_REPLY_TO=<staging reply-to>
PLATFORM_BILLING_LEGAL_NAME=HFY LLC
PLATFORM_PRODUCT_NAME=Platform
PLATFORM_BILLING_ADDRESS=<invoice address>
```

All application-level Resend delivery uses one central gateway. On the `staging` Preview deployment, it replaces every To recipient with `STAGING_EMAIL_RECIPIENT_OVERRIDE`, removes all Cc and Bcc recipients, and fails closed if the override is absent or invalid. The original recipients remain visible in the staging-only subject prefix. This protects account-setup and Talent invoice flows as well as Platform billing alerts, regardless of current or future staging test data.

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
- `invoice.created`
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

The disposable Stripe verifier uses Stripe's `pm_card_visa` fixture (the code-test equivalent of card `4242 4242 4242 4242`) for successful recurring payment and `pm_card_chargeCustomerFail` (the code-test equivalent of `4000 0000 0000 0341`) for an attached-card failure. It validates a paid bucket-derived invoice, an amount update on the same subscription ID, an annual-term schedule on that same subscription, and the expected card decline. It then cancels/deactivates its disposable test records.

The sample Platform invoice is written to `output/pdf/HFY-SAMPLE-PLATFORM-INVOICE.pdf` and must be visually reviewed after template changes.
