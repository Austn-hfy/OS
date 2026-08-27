# HFY OS - Production Invoice Acceptance Audit

**Audit date:** August 26, 2026  
**Production app:** https://hfy-os.vercel.app  
**Controlled Invoice:** `HFYQA-2026-0904`

## Outcome

The production Vercel runtime successfully generated and returned a real client-facing Invoice PDF with Chromium. The file passed structural, checksum, textual, and visual review. It does not expose talent cost, margin, Artist identity, payout information, payment details, internal notes, or other internal data.

The final fail-closed Approval transaction did not complete because Supabase Storage rejected Vercel's configured server credential with `Invalid Compact JWS`. The Invoice remains Draft, no Storage object was created, no Invoice Delivery record was created, and Resend was never called.

## Production prerequisites verified

- Supabase organization: Pro
- Scheduled daily backup: active
- Verified backup entry: August 26, 2026 at 19:09:35 UTC
- Owner `austyn@hearforyou.group`: confirmed and previously signed in
- Vercel deployment: healthy
- Healthchecks monitors: previously verified up
- Resend domain delivery: intentionally not attempted because DNS remains unverified

## Controlled fixture created

All fixture data is explicitly labeled as acceptance-test data and is isolated from Ace, which remains in Airtable.

- Client Account: `HFY Invoice Acceptance Test`
- Operations Residency: `HFY Invoice Acceptance Test`
- Residency slug: `hfy-invoice-acceptance-2026-08-26`
- Synthetic Artist: `Acceptance Test DJ`
- Scheduled Shifts: 4
- Internal Assignments: 4
- Draft Invoice: `HFYQA-2026-0904`
- Billing period: September 4-6, 2026
- Invoice date: September 7, 2026
- Client total: $2,000
- Auto-send: disabled
- Delivery reason: controlled acceptance test; never send through Resend

The fixture deliberately contains internal-only Artist, payout, Shift, Residency, and Client Account notes. That makes the PDF review a meaningful leakage test rather than an empty-data check.

## Scheduled client services

September 4, 2026:

- Pool, 12:00 PM-7:00 PM, 7 hours at $100/hour: $700
- Amigo Room, 9:00 PM-12:00 AM, 3 hours at $100/hour: $300
- Daily subtotal: $1,000

September 5, 2026:

- Pool, 12:00 PM-7:00 PM, 7 hours at $100/hour: $700
- Amigo Room, 9:00 PM-12:00 AM, 3 hours at $100/hour: $300
- Daily subtotal: $1,000

Invoice total: $2,000.

## Live runtime attempts

### Attempt 1 - packaging trace

- Vercel returned HTTP 500.
- Error: missing `playwright-core/browsers.json` in the temporary acceptance route's trace.
- Cause: the existing trace configuration correctly covered the normal Invoice application routes but not the temporary controlled test route.
- Result: Invoice stayed Draft; no PDF metadata or Storage object was written.
- Resolution: temporarily added the same Chromium trace files to the controlled route and redeployed.

### Attempt 2 - native generation and Storage upload

- Chromium started successfully in Vercel.
- HTML rendered successfully.
- The output passed the application's PDF header and size validation.
- Supabase Storage upload then returned HTTP 403 / `Invalid Compact JWS`.
- The approval process failed closed.
- Result: Invoice stayed Draft; an `invoice_pdf_generation_failed` Attention item was created; no Delivery record or Resend request occurred.

This attempt is the production proof that real Vercel/Chromium generation works: execution progressed past rendering and PDF validation and stopped only at the subsequent Storage API call.

### Attempt 3 - controlled render download

A temporary read-only render mode returned the same Draft's Vercel-generated PDF directly for inspection without approving, storing, or sending it.

- HTTP status: 200
- Format: PDF 1.4
- Generator: Chromium / Skia PDF m149
- Page size: US Letter
- Pages: 1
- Tagged: yes
- JavaScript: none
- Encryption: none
- Byte size: 45,560
- SHA-256: `e24ff4218a54ebbe3fbab2fcd379b75b53aab7d6e826182f402d0482d6cd0c50`
- Server-reported byte size matched the downloaded file.
- Server-reported SHA-256 matched the downloaded file.

The temporary acceptance route and its special trace rule were removed after this proof so no test-only production endpoint remains.

## PDF content verification

Present and correct:

- Hear For You issuer identity and billing email
- Invoice number
- Bill-to Residency and synthetic billing contact
- Invoice date, billing period, Net 7 terms, and due date
- Services grouped by date
- Pool and Amigo Room time ranges
- Quantities, client hourly rate, service amounts, daily subtotals, and $2,000 total
- Controlled-test note stating the document is not for payment
- Invoice version in the footer

Confirmed absent:

- Artist stage name or legal name
- Talent cost or compensation
- Gross margin or margin percentage
- Payout status or paid date
- Zelle, ACH, phone, or other payment details
- Artist, Assignment, Shift, Residency, or Client Account internal notes
- Peer review data
- The deliberately planted internal-only fixture markers

## Visual verification

The rendered page was inspected as a PNG after PDF rendering.

- No clipped or overlapping text
- No broken glyphs
- Clear date grouping and daily subtotals
- Legible service, time, quantity, rate, and amount columns
- Clear total-due hierarchy
- Correct two-line billing address after the synthetic fixture was corrected
- Footer and version visible

## Final production state

- Invoice status: Draft
- Invoice version: 1
- Invoice total: $2,000
- `pdf_storage_path`: null
- `pdf_generated_at`: null
- `pdf_byte_size`: null
- Objects in `invoice-pdfs`: 0
- Invoice Delivery records: 0
- Auto-send: false
- Resend attempts: 0
- Open Attention item: `invoice_pdf_generation_failed`
- Attention detail: `Invalid Compact JWS`

## Remaining blocker

Vercel's `SUPABASE_SERVICE_ROLE_KEY` value must be corrected or replaced so the Supabase Storage API accepts the server-side upload. The Supabase dashboard currently has both a backend `sb_secret_...` key and a legacy JWT-based `service_role` key available. No private key was revealed, copied, or moved during this audit.

After the Vercel secret is corrected:

1. Redeploy production so the corrected secret is active.
2. Approve the existing Draft `HFYQA-2026-0904` through the normal HFY OS Invoice action.
3. Confirm the `invoice-pdfs` object exists.
4. Confirm the Invoice stores path, source hash, SHA-256, byte size, snapshot, version, generated timestamp, and generating user.
5. Download through the normal authenticated Invoice PDF route and compare its SHA-256.
6. Keep auto-send disabled and do not call Resend until Squarespace DNS verification is complete.

## Repository commits used during the proof

- `4449a27` - Add one-time invoice acceptance runner
- `989f88e` - Trace Chromium files for invoice acceptance
- `966b4b5` - Expose controlled invoice render proof

The final cleanup/status commit removes the temporary endpoint and preserves only the reusable render/approval refactor and this audit record.
