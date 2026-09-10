# Hear For You Programming & HFYOS — Business Model

**Version:** v9
**Last updated:** September 9, 2026
**Changed this revision:** `HFY_Pricing_Framework_v7.md` fully reviewed and deleted — its old slot/retainer system is dead (replaced entirely by the hourly-markup model in Section 3.1), and its talent-markup mechanism was already captured. Two real resolutions folded in: (1) Full Programming clients pay BOTH the HFYOS subscription and HFY talent invoices, no discount, as two separate invoices — this was an open question, now resolved (Section 9). (2) The Assessment process's actual content (what gets asked) lives in the Rundown app/documentation, not a separate written doc — this was flagged as "undefined" for months; it wasn't undefined, it just lived somewhere else (Section 8).

**Status: WORKING DRAFT — still a snapshot of current thinking, not a locked decision.**

---

## 1. The Core Idea

HFY was built as a DJ/music programming agency. Running Ace Hotel's account surfaced something bigger: the internal tool built to manage DJs and dayparts isn't really a music tool — it's a general hospitality events-coordination tool. Music/DJs are the entry point, not the ceiling.

That realization split HFY into **two separate businesses** with two different economics:

- One is **labor** — sourcing, curating, and running talent. A service business. Scales by adding time and relationships.
- One is **software** — a platform hotels use to organize and track their own calendar, whether or not the agency is involved in any given slot. A product business. Scales by adding customers, not hours.

---

## 2. The Two Businesses

### Hear For You Programming
The existing agency. Full-service music/talent programming for hotels. HFY sources, schedules, and pays 100% of the talent for its accounts. **See Section 3 for the actual offer and pricing.**

### HFYOS *(working name — not finalized, may get an official separate name later; not a current priority)*
A **fully independent, separately branded** SaaS product — deliberately not named or styled after Hear For You in any way, so a hotel evaluating software doesn't feel funneled into hiring the agency.

- Self-serve. Hotel runs its own calendar.
- Billed per session/program that actually appears on the calendar (see Section 5), regardless of who's managing the talent in it.
- The two businesses can recommend each other informally; no fixed rule on which one leads a pitch.
- **Fully separate books**, even when both touch the same hotel's calendar.

---

## 3. Hear For You Programming — The Offer & Pricing

**What Programming actually is, in one line:**
> HFY picks the talent, coordinates the talent, and schedules the talent around whatever dayparts, timeframes, and events the hotel gives us.

There is no tier split. This is the only Programming offering — a client is either using Hear For You Programming for this, or they're not. (An earlier "Complete vs. Operations Only" two-tier structure, and an earlier four-component model, are both fully retired — not renamed, not folded in, just gone.)

**What's included:**
- **Assessment** — one-time, at the start of onboarding only. Not an ongoing deliverable, not something promised or marketed as continuing. It happens naturally while running an account, but it is never sold as a recurring service.
- **Talent selection, negotiation, contracting, scheduling, and payment** — HFY handles all of it, end to end, for every booking under this offer.
- **HFY is always the financial intermediary.** Even if a client makes an introduction to talent they already have a relationship with, HFY is still the one who negotiates, contracts, schedules, and pays. The client never transacts directly with talent.

### 3.1 Pricing — an hourly markup, not a monthly retainer

HFY charges the hotel an hourly rate for talent, pays the actual talent a lower hourly rate, and keeps the difference (the spread).

**Worked example (Ace Hotel, Thompson — both currently at this rate):**
- Client pays HFY: **$100/hour**
- HFY pays the DJ: **$80/hour**
- HFY's cut: **$20/hour**

This isn't a fixed number across every hotel — it scales with what a given property actually pays. A hotel paying $150/hour produces a correspondingly larger cut for HFY.

**Floors:**
- **Client-facing floor: $100/hour** — the minimum HFY charges any hotel for talent.
- **Internal floor: $20/hour cut, $80/hour to the DJ** — the minimum spread HFY will work for.

**Booking minimums:**
- **No minimum number of sessions.** A hotel can book Hear For You Programming for as little as one Friday a month.
- **Every individual session has a 3-hour minimum.** This is a per-session floor, not a monthly one — it limits how short any one booking can be, not how often a hotel books.

*(This hourly-markup pricing is entirely separate from HFYOS's own $1,000/month platform floor in Section 5 — different business, different floor, different reason for existing. Do not blend these two numbers together.)*

**Note on status:** this reflects current understanding as of this session. Still unresolved: how this interacts with whether a Full Programming client also owes a separate HFYOS subscription fee (see Section 11).

### 3.2 Special Events

Hear For You Programming can also run one-off Special Events for a client — a real, already-delivered capability (done for Ace), not just a future idea. Examples: headliners, brand activations, seasonal one-time moments. A client on standard ongoing Programming might reach out specifically for help hosting a one-off event.

**Positioning:** not public-facing, not something led with in a pitch — but a real differentiator worth having in the back pocket versus other programmers/collectives.

**Pricing: fully custom, not the standard hourly-markup model.** Headliners, special events, and other one-off bookings each require their own custom pricing — the $100/$80/$20 hourly structure in Section 3.1 does not apply here. No standard rate card exists for this yet; each one gets priced individually.

---

## 4. The "Request HFY" Mechanism

Inside an HFYOS account, for any slot, the client picks either:
1. **Their own artist** — added by the client to their own roster.
2. **"HFY"** — a special option the client can select but never browse behind.

Selecting "HFY" sends a request to Aus, who sources/assigns/pays a real DJ from Hear For You Programming's own roster, at HFY's own rate (per Section 3.1's pricing), for that one slot only. The client never gets roster access or a payment relationship with that artist.

**The two economics never mix:**

| | Client-owned slot | "Request HFY" slot |
|---|---|---|
| Who picks the artist | Client | HFY |
| Who sets the artist's pay rate | Client | HFY |
| Who sets the client-billed rate | N/A | HFY |
| What the client sees | Nothing | Only the resulting invoice total |

**Real-world proof point:** Ace Hotel's current setup already works this way — most slots self-managed by Ace, specific slots requested to HFY. This generates real Hear For You Programming revenue only on the slots actually requested — every other slot on the same calendar is pure HFYOS platform revenue, even though HFY earns nothing from it.

---

## 5. HFYOS Pricing Structure

### 5.1 The billing unit
**A session/occurrence is one actual appearance on the calendar** — not an assumed recurring pattern. If Pool runs Mon–Fri one week, that's 5 sessions that week, counted individually.

- **Talent Program** — any program with an outside paid person (DJ, instructor, host, performer). **$135 per session, every time it occurs.**
- **House Program** — no outside paid vendor. Billing depends on whether it's standing or one-off:
  - **Standing/recurring House program** — **$60/month flat**, regardless of how many times per week it runs (e.g. Deep Dives: Poolside Movie, every Sunday, still just $60/month total).
  - **One-off House program** — **$60 per occurrence.** A one-off that happens to run on multiple days (e.g. a two-day pop-up) bills once per day it runs, same logic as Talent — it is not "one program" just because it shares a name across consecutive days.

**The dividing line between Talent and House:** does someone external get paid and tracked to run this — not "is there a DJ" specifically.

### 5.2 No allowance
There is no free monthly allowance for one-off/occasional activities. **Everything that appears on the calendar bills, every time, no exceptions.**

### 5.3 Monthly floor
**$1,000/month standard floor.** Below this, the per-session math still applies in full — the floor exists specifically to prevent an account from being priced entirely on cheap House-only activity. **$500/month is a known, case-by-case exception floor** — granted individually as a discretionary favor, not advertised as a standard lower tier.

### 5.4 The plain-language explanation (for a GM)
> "We charge based on what you're running. Any program where you're paying an outside person is $135 a month per session. A standing thing without an outside vendor is a flat $60 a month, no matter how often it happens. A one-off thing, even without a vendor, is $60 each time it happens."

### 5.5 Commitment-tier pricing (concept, not finalized)
Month-to-month is the real, full-value rate — never discounted as a sales tactic. Quarterly/annual commitment tiers get a discount off that base rate. Exact percentages not yet set.

---

## 6. Worked Example: Ace Hotel

**This section was rebuilt by checking the live production calendar directly, not from memory — several real corrections came out of that process (see 6.5).**

### 6.1 Standing weekly programs

| Program | Day | Type | Monthly cost |
|---|---|---|---|
| Karaoke Night | Mon | Talent | $135 |
| Sunset Yoga | Tue | Talent | $135 |
| Line Dance With Scuff | Tue | Talent | $135 |
| Vintage Vinyl Night | Thu | Talent | $135 |
| Main Pool | Fri | Talent | $135 |
| Main Pool | Sat | Talent | $135 |
| Main Pool | Sun | Talent | $135 |
| Amigo Room | Fri | Talent | $135 |
| Amigo Room | Sat | Talent | $135 |
| Deep Dives: Poolside Movie (standing) | Sun | House | $60 |
| **Standing total** | | | **$1,275/month** |

### 6.2 This week's one-off activity (real example, no allowance applied)

| Program | Occurrence(s) | Type | Cost |
|---|---|---|---|
| Commune Pool | Sat + Sun | Talent | 2 × $135 = $270 |
| Amigo Room (extra) | Sun | Talent | $135 |
| Mahjong Club | Wed | House (one-off) | $60 |
| Desert Ink (tattoo pop-up) | Fri + Sat | House (one-off) | 2 × $60 = $120 |
| **One-off total** | | | **$585** |

### 6.3 Request HFY (separate, does not affect the platform total)
Hear For You Programming currently covers only **Friday's Main Pool session**, billed per Section 3.1's hourly model. Every other program above — including Sat/Sun Pool, Amigo Room, and all one-offs — is either self-managed by Ace or unfilled, and generates **zero Hear For You Programming revenue** regardless of HFYOS billing it.

### 6.4 Ace's total HFYOS bill this month
**$1,275 standing + $585 one-offs = $1,860.** *(Separate from whatever Friday's Request-HFY hourly billing comes to — the two totals are never combined into one number.)*

### 6.5 Corrections found by checking the live calendar instead of relying on memory
- Commune Pool is a **real, distinct, separately-booked slot** — initially left out of the verbal description entirely.
- The tattoo pop-up ("Desert Ink") runs **two consecutive days**, not "two separate pop-ups" as first described — and bills as two separate one-off occurrences (see 5.1).
- Mahjong Club actually ran **Wednesday**, not over the weekend as first assumed.
- "Movie Night" is likely the same program now actually named **"Deep Dives: Poolside Movie"** in the live system — worth confirming.
- An extra **Sunday Amigo Room session** was a real one-off, initially omitted from the description.

**This is the concrete case for checking the live app directly whenever building a real example — verbal recall missed five real details that direct verification caught.**

---

## 7. Other HFYOS Revenue Streams

- **Multi-property multiplier** — separate fee per property for hotel groups with multiple locations. No portfolio discount planned.
- **Talent directory add-on** *(future, not being built now)* — flat fee for a hotel to browse/contact HFY's roster directly, negotiating and paying talent themselves.
- **Guest-facing public calendar/website widget** *(future, possible add-on)* — auto-generated from the same source of truth the hotel already inputs.

**Explicitly rejected:** per-seat/per-user pricing — more staff using the tool should be encouraged, not taxed.

**Included, not charged separately:** white-glove onboarding — done personally, built into the price.

---

## 8. Assessment — How It Splits

- **Hear For You Programming path:** one-time only, at onboarding (see Section 3). **The actual step-by-step content — what gets asked, in what order — lives in the Rundown app/documentation, not a separate written process doc.** Rundown's questions aren't strictly chronological; they're the general set of things that need to be asked during an Assessment.
- **HFYOS path:** still has an intro meeting/demo, but the real equivalent is **onboarding**, done personally after signup, not before.

---

## 9. HFYOS Billing & Operations (confirmed decisions)

- **Full Programming clients pay both.** A Full Programming client owes the HFYOS platform subscription (Sections 5-6) *and* HFY talent invoices (Section 3.1) — two structurally separate invoices, on separate payment rails, no discount for being on both. This was previously an open question; now resolved.
- Billing runs on **Stripe**, card-on-file, recurring subscription — separate rails from Hear For You Programming's talent invoicing.
- Each Residency has a **Committed Plan** (what they're billed) and separate **Live Usage** tracking (what they're actually running).
- The invoice **never moves automatically** from Live Usage changes — only a manual Committed Plan update changes the bill.
- **Overages:** alert Aus, address manually, prorate-next-month approach.
- **Failed payments:** alert both Aus and the hotel contact. Do not restrict portal access. Persistent red banner until resolved.
- Plan changes update the existing Stripe subscription in place — one continuous billing history.

---

## 10. HFY OS Build Dependencies

- **DJ request/accept/decline automation engine (Telnyx)** — the technical implementation of "Request HFY."
- **"Request HFY" button on an open calendar slot** — the client-facing trigger.
- **Per-day billing granularity within a single Daypart** — needed for hybrid cases like Ace's real Friday-only HFY-requested slot within a 3x/week Pool pattern.
- **Recurring vs. one-time choice forced at creation time** — when a client adds something new, the system should force the choice up front rather than infer it later.
- **Real hotel client portal + per-Residency RLS** — the actual product surface an HFYOS client uses day to day.

---

## 11. Open Questions / Not Yet Decided

- **Whether a full program handoff to HFY should reduce a hotel's committed HFYOS plan size** — live idea, not decided.
- **Commitment-tier discount percentages (Section 5.5)** — concept confirmed, exact numbers not set.
- **HFYOS official naming/branding** — no name settled, not a current priority.
- **Talent directory add-on pricing** and interaction with HFY's existing roster exclusivity.
- **Multi-property multiplier exact structure** — no portfolio discount, but exact per-property number not set.
- **Whether this should eventually split into two separate documents** (a Hear For You Programming business model and a standalone HFYOS business model) rather than one combined doc — raised as a preference (Sept 9) but not decided; kept combined for now, with the two businesses' sections kept clearly separated internally (Section 3 = Programming, Sections 4-10 = HFYOS/shared) so a future split stays easy if this direction is chosen later.

*(`HFY_Core_Services.md` and `HFY_Pricing_Framework_v7.md` have both been fully reviewed and deleted — their content is either superseded or absorbed above. Neither needs further tracking here.)*

---

*This document should be revised as thinking develops — update the version header and filename each time it's substantively changed.*
