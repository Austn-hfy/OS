# Hear For You Programming & HFYOS — Business Model

**Version:** v14
**Last updated:** September 12, 2026
**Changed this revision:** Full replacement of Section 5 (HFYOS Pricing Structure) — the flat $60/session model, the four-tier commitment ladder, and the Founding Client program are all retired, replaced by a real bucket-based pricing model built from ten real hotels' actual program data, not a single hypothetical example. Also: Section 5.4's monthly floor is retired (the buckets now have a natural minimum). Section 5.6 (Founding Client Program) is removed entirely — no promotional/introductory pricing is being offered; the real, standing price applies from day one. Section 5.8 (Clawback) is simplified for the two-term model that replaced the old four-term ladder. Section 5.9 (the platform-fee incentive rule) is reworded to work in bucket terms instead of per-session terms; the underlying rule is unchanged. Section 6's worked examples are fully rebuilt with real numbers under the new model, using real data from ten properties, not three. Sections 9–11 updated to match.

---

**Status: WORKING DRAFT — Section 5's pricing model is now locked. Everything else in this document is still a snapshot of current thinking, not a locked decision.**

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
- Billed by capacity purchased, not by exact usage (see Section 5), regardless of who's managing the talent in any given slot.
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

*(This hourly-markup pricing is entirely separate from HFYOS's own platform pricing in Section 5 — different business, different numbers, different reason for existing. Do not blend these two together.)*

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

### 5.1 Vocabulary — locked

- **Daypart** — the recurring program *template*. "Main Pool — Friday, 12–7 PM" as a standing definition, independent of any specific date.
- **Session** — one actual instance of a Talent program running on one specific date. Real, individually tracked bookings — this is what determines how many Talent slots a client actually uses.
- **Slot** — the billing unit. One Talent session, or one distinct House program (see 5.2 for how House is counted). This is what a bucket is made of.
- **Bucket** — the capacity a client actually buys: a number of Talent slots and a number of House slots, purchased independently of each other (see 5.5).
- **Standing** — a Daypart that repeats weekly on a fixed day. A purely descriptive/scheduling label — it does not, by itself, change how anything bills.
- **One-off** — a Daypart that isn't a permanent weekly fixture. Also purely descriptive; bills the same as a standing session.
- **Program** — the category label only: **Talent Program** or **House Program**.

### 5.2 What actually counts as Talent vs. House

**The real test is not "is a paid person involved" — it's whether there's a real, variable rate being actively tracked and managed.**

- **Talent Program:** a real, tracked cost relationship — the rate could change, gets negotiated, or rotates between different people. Every real session (each date it actually runs) counts as one Talent slot used.
- **House Program:** everything else, including a fixed-cost arrangement with a real named partner (a nearby studio comping a class as a guest perk, a flat sponsorship with no rate to track). A House program counts as **one slot per distinct program**, regardless of how often it runs — daily or once a month costs the client the same.

**Why House is counted by program, not frequency:** the price is meant to reflect the work of actually tracking something. A House program creates zero marginal tracking work no matter how many times it runs, so it costs the same whether it happens once or every day.

**Classification cannot be gamed for pricing purposes.** House Activity Dayparts are structurally incapable of creating Talent, Assignment, or Payout records (per the platform's own Residency spec, Section 3.3) — a client who needs to track a real paid vendor is forced into Talent Program by missing functionality, not by trusting self-reporting. The one irreducible gap — a client paying someone entirely off-platform, in cash, with no record anywhere — is the same leakage every marketplace of this shape lives with.

### 5.3 Overage handling

Usage isn't hard-capped. If a client exceeds their purchased Talent or House slots in a given month, it's flagged, addressed manually, and resolved with a prorated adjustment on the next invoice — never an automatic mid-cycle re-bill or a blocked calendar. This is deliberate: it means a client is never suddenly locked out mid-month for growing faster than expected.

### 5.4 No separate monthly floor

There is no standalone monthly minimum. The smallest possible bucket combination (10 Talent slots + 5 House slots, the House floor — see 5.5) already sets the effective floor on its own. A separate minimum on top of that would conflict with the bucket structure rather than protect it.

### 5.5 The rate card — flat per-slot pricing, bought in buckets

**The core principle: price per slot doesn't change based on how much capacity is bought.** A bigger bucket isn't a cheaper rate — it's the same rate, just more room. This is the same logic as cloud storage tiers or usage-based SaaS pricing generally: buying more capacity doesn't mean paying less per unit, it means having more headroom.

**Rate: $30 per slot, flat — identical for Talent and House.**

**Talent buckets (clean tens, chosen for simplicity):**

| Bucket | Talent slots included |
|---|---:|
| Starter | 10 |
| | 20 |
| | 30 |
| | 40 |
| | 50 |
| | 60 |
| Enterprise | 70+ (custom-quoted, not a standard bucket) |

**House buckets:**

| Bucket | House slots included |
|---|---:|
| Floor (minimum, included on every plan) | 5 |
| | 10 |
| | 15 |

**A client's total monthly price = (Talent bucket size + House bucket size) × $30.** Two independent dials, one combined bill.

**Discount: 25% off for paying annually, upfront, instead of month-to-month.** This is the only discount that exists anywhere in this pricing model — there is no separate discount for buying a bigger bucket, and no promotional/introductory rate for new clients. The real, standing price applies from day one.

**Where these numbers came from:** built and stress-tested against ten real properties' actual program data (Ace Hotel, plus nine others including several prospects), not a single hypothetical example. Real resulting prices range from $450/month (smallest real account found) to $1,650/month (largest standard-tier account found), before Enterprise custom pricing. Checked against real market comparables — dedicated scheduling software runs $79–249/month; the closest functional comparable (real hospitality booking/event-coordination software) tops out around $300/month even for its highest-volume customers and is described by its own users as a premium price point at that level. HFYOS's range sits meaningfully above both. This is treated as an acceptable, deliberate premium position — HFYOS does substantially more than either category (real people, real payouts, real reconciliation, not just a shared calendar) and has no direct competitor — with the understanding that real client conversations, not further internal analysis, are the actual test of whether $30/slot holds.

### 5.6 Price-Change & Grandfathering Policy

The standing policy for any future rate change, based on standard SaaS practice (grandfathering with a stated end date, not indefinite legacy pricing):

- Any future rate increase applies to **new customers first.**
- **Existing customers keep their current rate for a stated window — 6 to 12 months from the date of the change** — never indefinitely.
- The change and its exact effective date are **announced personally and in writing, in advance** of taking effect. Never announced only via an invoice.
- Rates are **never changed retroactively.**

### 5.7 Early Termination Refund

Only relevant for a client who pays annually upfront and cancels before the year is used.

> **Refund = total annual payment paid − (months actually used × the full month-to-month rate for their bucket).** The client does not keep the annual discount for months they didn't use — the months actually served get priced at the real month-to-month rate, and everything else is refunded.

There is no term commitment shorter than a full year with any discount attached, so there's no multi-tier forgiveness schedule to track — month-to-month has no commitment and nothing to refund; annual has this one rule.

### 5.8 Platform Fee Waiver for Standing HFY-Managed Dayparts

When a Daypart's own standing setting — not a one-off "Request HFY" on an individual date — is HFY Managed, and has remained the standing setting for at least one full month, that Daypart's sessions no longer count toward the client's Talent bucket usage at all. HFY is instead earning directly from Section 3.1's hourly markup on every session under that Daypart.

This can genuinely lower a client's bill — if removing those sessions drops their real usage into a smaller bucket, their bucket (and price) can shrink, not just hold steady.

This applies at the Daypart level, not the whole account. A hotel can have some Dayparts standing HFY Managed (excluded from their bucket count) while other Dayparts stay Client Managed (counted normally) — for example, Pool split into a Friday-only HFY-Managed Daypart and a separate Saturday/Sunday Client-Managed Daypart. Only the Friday Daypart's sessions are excluded.

A one-off "Request HFY" on a single date never touches the Daypart's own standing setting — it only affects that specific date's own record. Those sessions still count toward the client's Talent bucket exactly like any other session, since nothing about the Daypart's own status changed to trigger an exclusion.

The one-month minimum exists specifically to prevent a Daypart being created and immediately dissolved just to dress up a one-off request as a standing commitment.

This is intentionally not revenue-neutral for HFY — a full standing handover earns less, in raw dollars, than the same volume billed as individual one-off requests would. The trade is deliberate: certainty, guaranteed volume, and an easier "yes" from the client, in exchange for a smaller per-session take.

---

## 6. Worked Examples

**Ten real properties' actual program data went into building and validating Section 5.5's bucket sizes. The three below are the headline examples; the full ten-property dataset lives in supporting pricing records, not duplicated here.**

### 6.1 Ace Hotel

**Rebuilt by checking the live production calendar directly, not from memory.**

**Talent sessions this month:**

| Program | Days | Sessions |
|---|---|---|
| Karaoke Night | Mon | 4 |
| Sunset Yoga | Tue | 5 |
| Line Dance With Scuff | Tue | 5 |
| Vintage Vinyl Night | Thu | 4 |
| Main Pool | Fri | 4 |
| Main Pool | Sat | 4 |
| Main Pool | Sun | 4 |
| Amigo Room | Fri | 4 |
| Amigo Room | Sat | 4 |
| Commune Pool (one-off) | Sat + Sun | 2 |
| Amigo Room — extra Sunday (one-off) | Sun | 1 |
| **Talent total** | | **41 sessions used** |

**House Dayparts this month (one slot per distinct program, regardless of frequency):**

| Program | Pattern |
|---|---|
| Deep Dives: Poolside Movie | Standing, every Sunday |
| Mahjong Club | One-off, single day |
| Desert Ink (tattoo pop-up) | One-off, 2 days |
| **House total** | **3 programs used** |

**Bucket fit: 41 Talent → 50-slot bucket. 3 House → 5-slot bucket (the floor). Total: 55 slots × $30 = $1,650/month, month-to-month.** Annual: 25% off, $1,237.50/month effective, billed upfront.

This is separate from whatever Hear For You Programming's hourly Request-HFY billing comes to (currently just Friday's Main Pool session, per Section 3.1) — the two totals are never combined into one number.

### 6.2 Thompson Palm Springs *(prospect, not yet a live client)*

Built from Thompson's own September calendar, including items Thompson wants tracked even though they don't generate the content themselves (Festival Theater movie night, Village Fest) — Thompson's stated reasoning is that their own calendar/website is unreliable, and this platform will eventually become their real source of truth via API push or embed (see the separate Broadcast concept for the syndication side of this).

**Talent:**

| Program | Days | Sessions |
|---|---|---|
| Pool DJ | Sat | 4 |
| Lola After Dark | Fri | 4 |
| Lola After Dark | Sat | 4 |
| Pool DJ — one-off (9/6) | Sun | 1 |
| **Talent total** | | **13 sessions used** |

**House:**

| Program | Pattern |
|---|---|
| The Perch Happy Hour | Daily |
| Bar Issi Martini Monday | Weekly, Mondays |
| Bar Issi Daily Happy Hour | Daily |
| Golden Hour | Weekly, Thursdays |
| Sunday Kind of Love | Weekly, Sundays |
| Festival Theater movie night | Weekly, Tuesdays |
| Village Fest | Weekly, Thursdays |
| HALL Tasting Room — Vine & Vibes | One-off |
| Giving Tuesday | One-off |
| **House total** | **9 programs used** |

**Bucket fit: 13 Talent → 20-slot bucket. 9 House → 10-slot bucket. Total: 30 slots × $30 = $900/month, month-to-month.** This is the one real account in the dataset where House meaningfully outweighs Talent as a share of the bill — direct validation that the two-dial model earns its keep.

### 6.3 The Saguaro *(prospect, not yet a live client)*

Built from Saguaro's live public events page. No House programs identified on their public page.

| Program | Days | Sessions |
|---|---|---|
| Glitter & Games | Fri | 4 |
| Saguaro Yoga | Sat | 4 |
| Saguaro Yoga | Sun | 4 |
| Saguaro Drag Brunch | Sat | 4 |
| Saguaro Drag Brunch | Sun | 4 |
| SWIMS w/ Sean Patrick | Sat | 4 |
| Sun and Sound | Fri | 4 |
| Sun and Sound | Sun | 4 |
| **Talent total** | | **32 sessions used** |

**Bucket fit: 32 Talent → 40-slot bucket. 0 House → 5-slot bucket (the floor, unused). Total: 45 slots × $30 = $1,350/month, month-to-month.**

### 6.4 What the full ten-property dataset shows

| Property | Talent bucket | House bucket | Price/mo |
|---|---:|---:|---:|
| W Austin | 10 | 5 | $450 |
| The Line LA | 10 | 5 | $450 |
| Downtown LA Proper | 20 | 5 | $750 |
| Santa Monica Proper | 20 | 5 | $750 |
| Thompson Palm Springs | 20 | 10 | $900 |
| W Hollywood | 30 | 5 | $1,050 |
| 1 Hotel Brooklyn Bridge | 30 | 5 | $1,050 |
| The Saguaro | 40 | 5 | $1,350 |
| Ace Hotel | 50 | 5 | $1,650 |
| Austin Proper | 50 | 5 | $1,650 |

Talent usage spreads widely across real properties (2 to 50 sessions); House usage clusters tightly near the floor, with Thompson as the one real outlier. Four properties land at the same $1,650 price point despite differing real usage — confirming a genuine, common "mid-size boutique" price point exists in the real market, not just in a single hypothetical example.

**A real classification nuance surfaced building this dataset, now folded into Section 5.2's rule:** several properties run a daily or near-daily wellness/fitness program through a single named studio or instructor at a fixed, non-negotiated rate — functionally a comped guest perk, not a tracked cost relationship. These were classified as House, not Talent, per Section 5.2's real test (a fixed arrangement with nothing to track, versus a real rate the hotel actively manages). This is expected to recur with future prospects and should be checked for explicitly during onboarding conversations, not assumed from a public calendar listing alone.

---

## 7. Other HFYOS Revenue Streams

- **Multi-property multiplier** — separate fee per property for hotel groups with multiple locations. No portfolio discount planned.
- **Talent directory add-on** *(future, not being built now)* — flat fee for a hotel to browse/contact HFY's roster directly, negotiating and paying talent themselves.
- **Guest-facing public calendar/website widget** *(future, possible add-on)* — auto-generated from the same source of truth the hotel already inputs. Thompson's situation (Section 6.2) is a second real, concrete validation of this need, alongside the original Ace request that started the idea.

**Explicitly rejected:** per-seat/per-user pricing — more staff using the tool should be encouraged, not taxed.

**Included, not charged separately:** white-glove onboarding — done personally, built into the price.

---

## 8. Assessment — How It Splits

- **Hear For You Programming path:** one-time only, at onboarding (see Section 3). **The actual step-by-step content — what gets asked, in what order — lives in the Rundown app/documentation, not a separate written process doc.** Rundown's questions aren't strictly chronological; they're the general set of things that need to be asked during an Assessment.
- **HFYOS path:** still has an intro meeting/demo, but the real equivalent is **onboarding**, done personally after signup, not before.

---

## 9. HFYOS Billing & Operations (confirmed decisions)

- **Full Programming clients pay both.** A Full Programming client owes the HFYOS platform subscription (Section 5) *and* HFY talent invoices (Section 3.1) — two structurally separate invoices, on separate payment rails, no discount for being on both.
- Billing runs on **Stripe**, card-on-file, recurring subscription — separate rails from Hear For You Programming's talent invoicing.
- Each Residency has a **Committed Plan** (their chosen Talent and House buckets) and separate **Live Usage** tracking (what they're actually running, in real sessions and real distinct House programs).
- The invoice **never moves automatically** from Live Usage changes — only a manual Committed Plan update (choosing a new bucket) changes the bill.
- **Overages:** see Section 5.3 — flagged, addressed manually, resolved with a prorated adjustment next cycle.
- **Failed payments:** alert both Aus and the hotel contact. Do not restrict portal access. Persistent red banner until resolved.
- Plan changes update the existing Stripe subscription in place — one continuous billing history.

---

## 10. HFY OS Build Dependencies

- **DJ request/accept/decline automation engine (Telnyx)** — the technical implementation of "Request HFY."
- **"Request HFY" button on an open calendar slot** — the client-facing trigger.
- **Real hotel client portal + per-Residency RLS** — the actual product surface an HFYOS client uses day to day.
- **Committed Plan and usage-tracking logic must reflect Section 5's bucket model** — Talent counted by actual sessions, House counted by distinct program regardless of frequency, then each mapped to the bucket it falls into for pricing. Not yet built as of this revision; today, mapping usage to a bucket and entering the Committed Plan is a manual step, the same way any other number is entered.
- **Section 5.8's Daypart-level bucket exclusion is not yet automated** — today, applying it means manually excluding the relevant sessions from a Committed Plan's usage count by hand. Teaching the automatic Live Usage tracker to recognize a Daypart's standing-HFY status and the one-month minimum on its own is future work.

---

## 11. Open Questions / Not Yet Decided

- **HFYOS official naming/branding** — no name settled, not a current priority.
- **Talent directory add-on pricing** and interaction with HFY's existing roster exclusivity.
- **Multi-property multiplier exact structure** — no portfolio discount, but exact per-property number not set.
- **Whether "Payment Status" stays visible to a Full Programming client** — undecided; leaning toward hidden-by-default (same toggle mechanism already used for Ace) since it's a purely internal HFY-DJ relationship in this tier, but not decided.
- **Whether this should eventually split into two separate documents** (a Hear For You Programming business model and a standalone HFYOS business model) rather than one combined doc — raised as a preference but not decided; kept combined for now, with the two businesses' sections kept clearly separated internally (Section 3 = Programming, Sections 4–10 = HFYOS/shared) so a future split stays easy if this direction is chosen later.
- **Whether $30/slot holds up once tested in real client conversations** — not treated as blocking anything tonight, but the honest, explicit understanding is that this number has not yet been tested against what a real prospect will actually say yes to.

---

*This document should be revised as thinking develops — update the version header and filename each time it's substantively changed.*
