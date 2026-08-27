# HFY OS - Production Invoice Acceptance Audit

**Audit date:** August 26, 2026  
**Production app:** https://hfy.app  
**Controlled Invoice:** `HFYQA-2026-0904`

## Outcome

The production Vercel runtime successfully generated, stored, and approved a real client-facing Invoice PDF with Chromium. The document passed structural, textual, and visual review. It does not expose talent cost, margin, Artist identity, payout information, payment details, internal notes, or other internal data.

The earlier `Invalid Compact JWS` failure correctly failed closed. After the Vercel Storage credential was replaced with the correct legacy JWT-format `service_role` key, the same Draft completed Approval successfully. The immutable PDF is present in `invoice-pdfs`, the Invoice is Approved, no Invoice Delivery record exists, auto-send remains disabled, and Resend was never called for this Invoice.

## Production prerequisites verified

- Supabase organization: Pro
- Scheduled daily backup: active
- Verified backup entry: August 26, 2026 at 19:09:35 UTC
- Owner `austyn@hearforyou.group`: confirmed and previously signed in
- Vercel deployment: healthy
- Healthchecks monitors: previously verified up
- Resend domain: verified
- Supabase Auth custom SMTP: active through a dedicated Resend send-only credential
- Owner production login: working
- Invoice delivery: intentionally not attempted; the acceptance Residency remains manual-send only

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

- Invoice status: Approved
- Invoice version: 1
- Invoice total: $2,000
- `pdf_storage_path`: `11111111-1111-4111-8111-111111110002/11111111-1111-4111-8111-111111110004/v1/fa1f2e9279dd416e-dc9b7dc9-5196-4cf4-886e-f56c2a61d7ea.pdf`
- `pdf_source_hash`: `fa1f2e9279dd416edd27ecb560e2ca756325d04ce117f4b67522587f3e126ffc`
- `pdf_sha256`: `b2be3ef730673073ceb5de1164a2ce043b8158e94df41cdf0edc71202597d952`
- `pdf_generated_at`: August 27, 2026 at 02:11:14.906 UTC
- `pdf_generated_by_user_id`: `d32a4d34-3882-45aa-a5b6-2f77cd037220`
- `pdf_byte_size`: 45,560
- Canonical snapshot: present as a JSON object
- Objects in `invoice-pdfs`: 1 matching object
- Storage object size: 45,560
- Invoice Delivery records: 0
- Auto-send: false
- Resend attempts: 0
- Approval audit entry: present
- Prior `invoice_pdf_generation_failed` Attention item: resolved
- Production action after Approval: Download PDF only

## Remaining verification note

The normal authenticated Download PDF action successfully initiated a browser download. The browser security boundary did not permit the automation to extract that download's local filesystem path, so SHA-256 was not recomputed from the downloaded bytes in this session. No workaround was attempted.

The Invoice and Storage metadata independently confirm the same 45,560-byte object, and the application stored the PDF SHA-256 at generation time. The production UI removes the approval action once Approved, and the server-side approval path rejects any Invoice whose status is not Draft.

The controlled fixture remains in production pending fresh approval to delete or archive it. Auto-send remains disabled, and no Invoice-delivery test was performed.

## Repository commits used during the proof

- `4449a27` - Add one-time invoice acceptance runner
- `989f88e` - Trace Chromium files for invoice acceptance
- `966b4b5` - Expose controlled invoice render proof

The final cleanup/status commit removes the temporary endpoint and preserves only the reusable render/approval refactor and this audit record.
