# Hear For You Programming & HFYOS — Business Model

**Version:** v12
**Last updated:** September 10, 2026
**Changed this revision:** A full, deliberate rework of Section 5 (HFYOS Pricing Structure) — not a clarity fix like v11, an actual pricing change, arrived at by working through real objections against real client calendars (Ace, Thompson, Saguaro) and researched SaaS launch/pricing practice. Summary of what changed:

1. **The core rate dropped from $135/$60 to a single $60/session, and the billing logic simplified.** Talent Programs now bill **$60 per session, every session, always** — standing or one-off makes no difference. House Programs now bill **$60 flat per Daypart, once, regardless of frequency** — standing or one-off makes no difference either. This replaces the old two-axis "Type sets rate, Standing/One-off sets count" model, which only applied consistently to House and never actually applied to Talent the way it was written.
2. **New vocabulary, locked to prevent the confusion that caused this rewrite:** Daypart, Session, Standing, One-off, Program are now explicitly defined (Section 5.1).
3. **New: a Founding Client Program** (Section 5.6) — a time-bound, penetration-pricing launch offer, not a permanent rate.
4. **New: a Price-Change & Grandfathering Policy** (Section 5.7) — the general principle for any future rate change, modeled on standard SaaS practice.
5. **New: a commitment-tier ladder** (Section 5.5) and **Early Termination / Clawback policy** (Section 5.8) — both fully specified for the first time; Section 5.5 previously existed only as a placeholder.
6. **Section 6's Ace worked example is fully rebuilt** at the new rate, and two additional real properties (Thompson Palm Springs, The Saguaro) are added as further worked examples.
7. **The classification-gaming concern that motivated a lot of this session's debate is now structurally resolved**, not policed: because House bills the same flat $60 whether it's Standing or One-off, there is no longer any pricing incentive for a client to mislabel a program to get a cheaper rate.

---

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

### 5.1 Vocabulary — locked, to prevent the confusion that caused this rewrite

- **Daypart** — the recurring program *template*. "Main Pool — Friday, 12–7 PM" as a standing definition, independent of any specific date.
- **Session** — one actual instance of a program running on one specific date. This is the billing unit. It replaces "slot" and "occurrence" as separate words for the same thing — there is now only one word for this concept.
- **Standing** — a Daypart that repeats weekly on a fixed day. A purely descriptive/scheduling label now — it does not, by itself, change how anything is billed (see 5.2).
- **One-off** — a Daypart that isn't a permanent weekly fixture — could be genuinely single-instance, or could later be converted into a Standing Daypart if it keeps happening. Also purely descriptive for billing purposes.
- **Program** — the category label only: **Talent Program** or **House Program**. Not a specific instance — a Daypart is the instance; a Program is what type it is.

### 5.2 The billing rule — one principle, two rates

**The single underlying principle: price follows tracked work, not frequency of use.** A Talent booking creates new, real work every time — sourcing, a rate, a payout, reconciliation. A House program creates none of that, ever, no matter how often it runs. That's the whole reason the two Program types bill differently — not an arbitrary split.

- **Talent Program — $60 per session, every session, no exceptions.** Standing or One-off makes no difference. A Daypart that runs 4 times this month is 4 sessions, 4 charges. A one-off that happens once is 1 session, 1 charge.
- **House Program — $60 flat, once, per Daypart, per month, regardless of frequency.** Standing or One-off makes no difference. A Daypart that runs every day this month is still $60. A one-off that happens to span multiple days is still $60 once, not once per day.

**Why House stays flat even when it recurs, and even when a one-off spans multiple days:** the price is meant to reflect the work of tracking something, and a House program creates zero marginal tracking work regardless of how many times it runs — the same reason an unstaffed gym floor is priced as flat monthly access while a personal trainer session is priced per booking. Once this framing is applied consistently, there's no principled reason left to charge a House one-off differently from a House standing program — both cost you nothing extra to track, so both cost the client the same $60, once.

**Classification cannot be gamed for pricing purposes anymore.** Because Standing vs. One-off no longer changes the price for either Program type, there's no financial incentive to mislabel something to get a cheaper rate. The real backstop, independent of pricing: House Activity Dayparts are structurally incapable of creating Talent, Assignment, or Payout records (per the platform's own Residency spec, Section 3.3) — a client who needs to track a real paid vendor (roster history, payout tracking, anything beyond a free-text name) is forced into Talent Program by missing functionality, not by trusting them to self-report honestly. The one irreducible gap — a client paying someone entirely off-platform, in cash, with no record anywhere — is the same leakage every marketplace of this shape lives with, and isn't solvable by pricing structure.

### 5.3 No allowance
There is no free monthly allowance for one-off/occasional activities. Everything that appears on the calendar bills, according to the rule in 5.2, no exceptions.

### 5.4 Monthly floor
**$1,000/month standard floor.** Below this, the per-session/per-Daypart math still applies in full — the floor exists specifically to prevent an account from being priced entirely on cheap House-only activity. **$500/month is a known, case-by-case exception floor** — granted individually as a discretionary favor, not advertised as a standard lower tier. The floor applies to the client's total bill regardless of which rate tier (Section 5.5) or Founding status (Section 5.6) they're on — it is a floor on the invoice total, not on the per-session rate itself.

### 5.5 Commitment-tier pricing — the standard rate card

This is the pricing every client moves to once they're no longer in the Founding Client window (Section 5.6) — either because they signed up after it closes, or because their individual Founding period has ended.

| Term | Rate/session (Talent) |
|---|---|
| Month-to-month | $90 |
| 3-month | $80 |
| 6-month | $70 |
| 12-month | $60 |

- **No prepayment required at any tier.** Billing stays monthly against real, actual sessions regardless of which term is chosen — the term only determines which rate applies for its duration, not when or how billing happens.
- **House Program rate under this ladder:** stays flat $60, unaffected by term choice, for now. This is a real open item, not a settled decision — see Section 11.

### 5.6 Founding Client Program — the current, active launch offer

This is **penetration pricing**, deliberately temporary, adopted to solve two problems raised directly by early prospect conversations: getting genuine early usage on the platform, and not asking an unproven vendor for a term commitment before they've seen it work.

- **Eligibility window:** any client signing between now and **August 2027**.
- **Rate:** **$60/session flat — Talent and House alike — no term selection, no commitment required.**
- **Duration per client:** **6 months from that individual client's signing date.** A client signing in August 2027 keeps the Founding rate through February 2028; a client signing today keeps it through March 2027. Each client's own clock is independent.
- **After the 6 months:** the client moves onto the standard commitment ladder (Section 5.5) for the first time, and chooses a term like any new client would.
- **No clawback, no penalty, no minimum stay during the Founding window.** The rate was never conditioned on staying, because no discount is being traded for a commitment during this period — it's simply the current rate for everyone in this cohort.

### 5.7 Price-Change & Grandfathering Policy — the general principle for any future rate change

This is the standing policy for any base-rate increase beyond the Founding-to-standard transition above, based on standard SaaS practice (grandfathering with a stated end date, not indefinite legacy pricing):

- Any future rate increase applies to **new customers first.**
- **Existing customers keep their current rate for a stated window — 6 to 12 months from the date of the change** — never indefinitely.
- The change and its exact effective date are **announced personally and in writing, in advance** of taking effect. Never announced only via an invoice.
- Rates are **never changed retroactively.**

### 5.8 Early Termination / Clawback

**This policy applies only once a client is on the standard commitment ladder (Section 5.5) — it does not apply during the Founding Client window (Section 5.6) under any circumstance**, since no commitment discount exists yet to claw back.

For a client on a committed term (3/6/12-month) who cancels before the term ends:

> **Clawback = (month-to-month rate − committed rate) × sessions already billed during the term.** Charged as a line item on the final invoice. No charge applies to months not yet served — only the discount gap on sessions already delivered is recovered.

**Forgiveness windows** (no clawback applies if canceling after this point in the term):
- **12-month term:** no clawback after month 9.
- **6-month term:** no clawback after month 4.
- **3-month term:** no forgiveness window — clawback applies in full at any point of cancellation.

---

## 6. Worked Examples

### 6.1 Ace Hotel

**Rebuilt by checking the live production calendar directly, not from memory.**

**Talent sessions this month (standing + one-off, no distinction in billing):**

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
| **Talent total** | | **41 sessions × $60 = $2,460** |

**House Dayparts this month (flat regardless of frequency or one-off/standing status):**

| Program | Pattern | Charge |
|---|---|---|
| Deep Dives: Poolside Movie | Standing, every Sunday | $60 |
| Mahjong Club | One-off, single day | $60 |
| Desert Ink (tattoo pop-up) | One-off, 2 days | $60 |
| **House total** | | **$180** |

**Ace's total HFYOS bill: $2,460 + $180 = $2,640/month.** *(At the standard Section 5.5 12-month rate. Under the Founding Client rate in 5.6, both Talent and House bill flat $60 — Talent's total is unchanged since $60 is already the 12-month rate; the difference is no term commitment is required to get it.)*

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
| **Talent total** | | **13 sessions × $60 = $780** |

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

9 Dayparts × $60 = **$540**.

**Thompson's total: $780 + $540 = $1,320/month.**

### 6.3 The Saguaro *(prospect, not yet a live client)*

Built from Saguaro's live public events page. No House programs identified on their public page — worth confirming directly whether an unstaffed activity exists that just isn't publicly listed.

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
| **Talent total** | | **32 sessions × $60 = $1,920** |

**Saguaro's total: $1,920/month**, entirely Talent.

### 6.4 What these three examples show, side by side

| Property | Talent | House | Total |
|---|---|---|---|
| Ace Hotel | $2,460 | $180 | $2,640 |
| Thompson Palm Springs | $780 | $540 | $1,320 |
| The Saguaro | $1,920 | $0 | $1,920 |

All three clear the $1,000 standard floor without needing it. Thompson is the tightest case — its all-in total sits closer to the floor than the other two, worth knowing before pitching them specifically.

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

- **Full Programming clients pay both.** A Full Programming client owes the HFYOS platform subscription (Sections 5-6) *and* HFY talent invoices (Section 3.1) — two structurally separate invoices, on separate payment rails, no discount for being on both.
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
- **Real hotel client portal + per-Residency RLS** — the actual product surface an HFYOS client uses day to day.
- **Committed Plan and usage-tracking logic must reflect Section 5.2's final rule** — Talent counted by actual sessions, House counted as a flat per-Daypart charge, independent of Standing/One-off status. (As of this revision, the platform's usage-tracking code counts Talent by standing weekly slot rather than actual session count — this needs to change to match 5.2.)
- **Founding Client tracking** — each client's individual 6-month Founding clock (from their own signing date), and the transition into the standard commitment ladder when it ends, needs to be tracked per-Residency, not globally.

---

## 11. Open Questions / Not Yet Decided

- **Does House pricing get its own commitment-tier discount under Section 5.5, or does it stay flat $60 regardless of term, indefinitely?** Currently flat by default — genuinely undecided, likely to be revisited once the Founding window matures and real usage data exists.
- **Whether a full program handoff to HFY should reduce a hotel's committed HFYOS plan size** — live idea, not decided.
- **HFYOS official naming/branding** — no name settled, not a current priority.
- **Talent directory add-on pricing** and interaction with HFY's existing roster exclusivity.
- **Multi-property multiplier exact structure** — no portfolio discount, but exact per-property number not set.
- **Whether "Payment Status" stays visible to a Full Programming client** — undecided; leaning toward hidden-by-default (same toggle mechanism already used for Ace) since it's a purely internal HFY-DJ relationship in this tier, but not decided.
- **Whether this should eventually split into two separate documents** (a Hear For You Programming business model and a standalone HFYOS business model) rather than one combined doc — raised as a preference but not decided; kept combined for now, with the two businesses' sections kept clearly separated internally (Section 3 = Programming, Sections 4-10 = HFYOS/shared) so a future split stays easy if this direction is chosen later.

---

*This document should be revised as thinking develops — update the version header and filename each time it's substantively changed.*
