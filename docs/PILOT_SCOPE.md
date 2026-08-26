# HFY OS pilot scope

## Launch boundary

The pilot is a clean system for new hotel residencies. Ace Hotel remains entirely operational in the existing Airtable base. The pilot does not read from, write to, migrate, or synchronize with Ace. A separate, clearly labeled Ace parity sandbox can exist in HFY OS staging solely to prove Dayparts, booking, payout, and Invoice behavior against the approved rules.

Each new hotel is created in the shared HFY OS database and appears in the internal All Residencies dashboard. The current product surface is for HFY operators; account membership primitives remain available for a future role-based login design.

## Client-facing capability

A separate hotel portal is not part of the active pilot. The `/hotel` route returns to sign-in, and the internal preview has no hotel-portal entry point. Client-facing roles and visibility rules will be designed later around the final login experience.

## Internal parity

The pilot preserves the existing HFY OS outcomes for Talent, Residencies, Shifts, Assignments, Payouts, and Invoices, including:

- Completed and eligible Assignments become Ready to Pay.
- Confirmed past bookings auto-complete after 6:00 a.m. in the Residency's timezone.
- New Shifts link to the unique covering Invoice period.
- Invoice approval validates scheduled service charges, freezes a client-safe snapshot, generates and immutably stores a native PDF, and then sends through Resend when auto-send is enabled.
- Residency Invoices supports two explicit Draft paths: scheduled services selected from eligible unlinked Shifts, and custom client line items for ad-hoc billing. Custom Invoices never participate in Shift coverage, linking, or reconciliation.
- Billing contact, number prefix, terms, cadence, line presentation, default note, and manual/automatic delivery are configured inside each Residency's Invoices workspace. Company identity and logo remain global Admin settings.
- Client Invoice PDFs contain only the hotel's scheduled service dates, times, hours, client rates, and client totals. Artist identity, compensation, payment details, peer reviews, and internal margin remain inside HFY OS.
- Company-wide Invoice branding is managed once in Admin settings. Each approved Invoice snapshot records the exact logo and issuer details used, and its service lines are grouped by date with daily subtotals for quick weekend review.

The new database replaces Airtable audit formulas with foreign keys, checks, unique constraints, Shift-level invoice-link issue fields, and parity tests. No invoice-link Attention UI or notification system is part of this phase.

## Pipeline foundation

The internal company workspace now has a separate Pipeline mode. A Lead records the property, primary contact, phone, email, inbound/outbound source, ordered Pipeline status, status age, and one accumulated pre-signature notes field. Lost Leads remain visible.

Lead and Residency are two lifecycle modes of the same database record. Selecting Won requires the operational Residency foundation—location, timezone, tier, rates, Invoice identity, billing recipient, terms, cadence, presentation, and delivery choice—then moves that same record into Operations. The record ID, contact history, and accumulated notes do not change.

Meetings/calendar linkage, external Rundown writeback, and Proposal generation or sending from Leads remain out of scope for this pass.

## Deferred

Ace operational migration, historical import, the hotel-facing login experience, Trigger.dev, Sentry, transactional outbox/event sourcing, full agreement versioning, Rundown, and broader client workflows are not pilot dependencies.

## Later Ace migration

After one or preferably two clean billing cycles:

- Historical closed records can be imported read-only on an independent schedule.
- Open records require exact financial reconciliation at cutover to prevent duplicate payment or billing.
- No production dual-write is permitted.
