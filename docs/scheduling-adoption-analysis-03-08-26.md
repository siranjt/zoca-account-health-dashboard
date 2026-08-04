# Scheduling: pitch, conversion and non-conversion

**Date:** 03/08/26
**Sources:** Aurora via Metabase (DB 7) — `scheduling.*`, `chargebee.*`, `sales.fireflies_meeting`, `cx.*`, `offboarding.*`; Chargebee product catalogue.
**Window:** scheduling onboarding records run 30/01/26 – 31/07/26.

---

## 1. The headline you did not ask for but need first

**The pitch was never recorded.** There is no table, field or CRM object in any Zoca system that says "scheduling was offered to account X on date Y, and they said Z."

Verified absences:

| Where a pitch record should live | What is actually there |
|---|---|
| `cx.upsell_potential` | Covers only the five AI agents (ADS, WIN, LOYALTY, SOCIAL, DISCOVERY). No scheduling row. Stops 12/01/26. All 3,124 rows status `POTENTIAL`. `upsold_amount` = 0 on every row. |
| `sales.customer_meetings.product` | Null on 11,113 of 11,128 rows (99.9%). The 15 populated rows are Social-Media, Ads-Budget, Local-SEO — May 2025 only. |
| `sales.fireflies_meeting.entity_id` | Populated on 431 of 22,242 rows (1.9%). Useless as a join key — but attribution is still possible via `participants` email (Section 2). |
| `cx.open_issues`, `cx.churn_potential` | Both stop writing 14/01/26 — two weeks *before* scheduling launched. |
| `offboarding.reason_template_mapping` | 30 rows total, exactly 5 per reason. A seeded template list, not collected data. |
| Chargebee catalogue | No scheduling SKU. Closest items are `Booking-Agent`, `Lead-to-Booking`, `FrontDesk`. Scheduling is bundled, so billing gives no conversion signal either. |

No system *records* the pitch as a field. **But it is recoverable from call transcripts** — see Section 2, which answers the question for July 2026. The recovery route: `sales.fireflies_meeting.participants` carries attendee emails, and those join to `chargebee.customers.email`. Across all history that maps **7,623 calls to 1,446 customers (765 entities)** — the attribution path I wrongly wrote off on a first pass by checking only the near-empty `entity_id` column.

**Schema trap worth recording:** `scheduling.onboarding.entity_id` overlaps with *nothing* — zero rows in common with `scheduling.bookings.entity_id` or `chargebee.entity_customer_mappings.entity_id`. The real account key is **`location_entity_id`** (286 of 444 overlap with bookings, 270 with Chargebee). Any query joining on `entity_id` silently returns zero.

---

## 2. How many accounts scheduling was pitched to — July 2026

Answered by classifying every recorded call in the month against the transcript, then mapping each call to an account via participant email.

### Method

1. All 1,051 Fireflies calls with `meeting_time` in July 2026; 1,046 carry a transcript.
2. Extract attendee emails from `participants` by regex (the field is inconsistently formatted — some rows are JSON arrays, some comma-separated strings, so a JSON cast fails).
3. Drop internal domains: `zoca.com`, `timelyai.com`, `zoca.ai`.
4. Join remaining emails to `chargebee.customers.email` → account.
5. Flag calls whose transcript contains an **offer** of Zoca's own scheduling ("our own booking platform", "we have launched", "comes with a booking platform", "no extra charges", "included in your subscription", "show you our scheduling platform"…).
6. **Subtract accounts already live on Zoca scheduling before the call** — offer language spoken to an existing user is support, not a pitch.

Step 6 is what makes the number honest. Without it the figure is 110, and it is wrong.

### Result

| Stage | Count |
|---|---|
| July calls recorded | 1,051 |
| With transcript | 1,046 |
| With an external participant | 777 (433 distinct emails) |
| Mapped to a known Chargebee account | 462 calls → **230 accounts** |
| Accounts whose call discussed booking/scheduling | 141 |
| Accounts that heard an explicit offer | 110 |
| …minus those already live on Zoca scheduling (support, not pitch) | −12 |
| **Accounts pitched scheduling in July 2026** | **98** |

### What those 98 did next

| Outcome | Accounts | Rate |
|---|---|---|
| **Pitched** | **98** | 100% |
| Entered scheduling onboarding after the call | 22 | 22% |
| **Reached "scheduling enabled"** | **15** | **15%** |
| Never started onboarding at all | 76 | 78% |

**July pitch-to-activation conversion is 15%.** Roughly one in seven pitches produced a working booking system; more than three in four produced nothing at all.

### Coverage limits — read before quoting

- **98 is a floor, not a ceiling.** It counts only accounts whose attendee email matched a Chargebee customer record. 230 of 433 distinct external emails matched (53%). A pitch to an account whose attendee used an unrecorded email is invisible here.
- **A further ~84 distinct external emails were pitched but match no Chargebee customer.** Those are prospects — new-business pitches, not upsells to the existing book. They are excluded from the 98 deliberately, since the question was about accounts.
- **284 individual calls in July contained offer language**, against 98 pitched accounts — accounts were pitched repeatedly, averaging ~2.9 offer-bearing calls each.
- Attribution of the 22 onboardings to the pitch is by time order (onboarding created after the call), not by a causal link. Within a one-month window this is reasonable, not proven.
- The offer regex was validated by reading all 141 candidate excerpts by hand before it was written; it is a formalisation of that read, not a guess.

---

## 3. What converted — hard numbers

444 locations entered the scheduling onboarding flow between 30/01/26 and 31/07/26.

| Step | Count | % of entered |
|---|---|---|
| Entered onboarding | 444 | 100% |
| Opted in | 438 | 98.6% |
| Business details set | 418 | 94.1% |
| Services configured | 397 | 89.4% |
| Booking rules configured | 394 | 88.7% |
| Booking policies configured | 392 | 88.3% |
| Website flipped to Zoca booking | 374 | 84.2% |
| Onboarding completed | 370 | 83.3% |
| **Scheduling enabled** | **368** | **82.9%** |
| Payments configured | 79 | 17.8% |
| Payments setup explicitly skipped | 317 | 71.4% |
| Ever took a booking | 286 | 64.4% |
| Ever took a customer-made online booking | 251 | 56.5% |
| Booked in last 90 days | 198 | 44.6% |
| **Booked in last 30 days** | **147** | **33.1%** |

**Read this as three different conversion rates, and be explicit about which one is quoted:**

- **Setup conversion — 83%.** Of accounts that started, 368 got scheduling switched on. Strong.
- **Activation conversion — 64%.** 286 took at least one booking. 82 accounts turned it on and never used it.
- **Sustained conversion — 40%.** Only 147 of the 368 enabled accounts took a booking in the last 30 days. **60% of enabled accounts are dormant.**

### Against the billed book

764 accounts are `active` / `in_trial` / `non_renewing` in Chargebee. Of those, **156** map to a scheduling onboarding record — 20% of the paying base.

The gap between 444 locations and 156 billed accounts: 270 of the 444 map to a Chargebee customer of any status (so ~114 belong to accounts since cancelled), and 174 have no Chargebee mapping at all — additional locations under a parent account, or unbilled entities. **If anyone quotes "444 accounts", it is wrong.** The account figure is 156; 444 is locations.

### Cohort decay — the real problem

| Cohort | Enabled | Ever booked | Live in last 30d | % live |
|---|---|---|---|---|
| Jan 26 | 6 | 6 | 1 | 16.7% |
| Feb 26 | 71 | 57 | 14 | 19.7% |
| Mar 26 | 53 | 39 | 11 | 20.8% |
| Apr 26 | 38 | 34 | 13 | 34.2% |
| May 26 | 43 | 30 | 11 | 25.6% |
| Jun 26 | 68 | 50 | 32 | 47.1% |
| Jul 26 | 89 | 63 | 62 | 69.7% |

Every cohort settles at roughly **20–25% still booking**. July looks healthy only because it just onboarded. This is not a conversion problem, it is a retention problem — the pitch works, the habit does not form.

### The value that did land

- **$645,568.21** in completed payments processed through Zoca scheduling, **6,061 transactions**, across **139 accounts**. (Plus $4,382 failed, $5,387 cancelled, $1,069 processing.)
- **70,446 bookings** total. 47,427 were historical migrations; **23,019 are native Zoca bookings**.
- Native breakdown: staff-made (SP) 11,028 · system 7,091 · **customer self-serve (EC) 4,352** · client app 260 · MCP 48.

That $645k figure is the strongest number in this document. It is the only one denominated in dollars.

---

## 4. Why the others did not convert

Two classes of evidence: mechanical (recorded in the funnel) and stated (in call transcripts). The mechanical evidence is reliable. The stated evidence is directional only — see the caveat.

### 4a. Mechanical — what the funnel proves

**Payments is the wall.** 317 of 444 locations (71%) explicitly skipped payment setup; only 79 (18%) configured it. Every downstream capability — deposits, no-show fees, card-on-file — is gated behind that step. An account that skips payments is running a diary, not a booking system, and a diary loses to whatever they already have.

**The 82 who enabled and never booked.** 368 enabled, 286 ever booked. These 82 completed every setup step and then did nothing. They are the cleanest signal available that setup completion is being mistaken for adoption.

**Incumbent displacement is real but tiny.** Only 14 accounts imported history from another system:

| Prior system | Bookings migrated | Accounts |
|---|---|---|
| Square | 7,748 | 4 |
| Vagaro | 6,321 | 1 |
| Fresha | 4,984 | 1 |
| Booksy | 4,088 | 1 |
| GlossGenius | 3,978 | 1 |
| Acuity | 3,338 | 4 |
| Setmore | 1,158 | 1 |
| GoDaddy | 56 | 2 |
| Zoca internal ops | 15,756 | 2 |

14 accounts out of 444 actually moved their history across. The rest either had nothing to move, or never fully switched — which is consistent with the 60% dormancy.

### 4b. Stated — what customers said on calls

**Caveat, stated plainly:** 1,829 Fireflies calls between 01/11/25 and 03/08/26 discuss scheduling or online booking. They carry **no `entity_id`**, so these reasons **cannot be counted per account** and must not be presented as "N accounts said X". Keyword counts below indicate topic prevalence in call summaries, nothing more. A defensible per-account breakdown requires LLM classification of the transcripts plus an email→entity mapping — neither exists today.

Topic prevalence across the 1,829 scheduling calls:

| Topic in summary | Calls | Share |
|---|---|---|
| Deferred / "not right now" language | 441 | 24% |
| Migration or data-transfer effort | 247 | 14% |
| Payments, deposits, no-show fees | 227 | 12% |
| Contract / lock-in language | 215 | 12% |
| Explicit refusal language | 174 | 10% |
| Prefers phone / walk-in / manual | 119 | 7% |
| Price or budget | 69 | 4% |
| Staff resistance or complexity | 42 | 2% |
| **Named an incumbent competitor** | **303** | **17%** |

Incumbents named: Square 269 · Vagaro 105 · Booksy 46 · Mindbody 39 · Fresha 35 · Acuity 26 · StyleSeat 11 · GlossGenius 11 · other (Boulevard, Phorest, Setmore, Schedulicity) 43. *The Square count is inflated — "square" matches non-product uses. Treat Vagaro, Booksy, Mindbody and Fresha as the reliable signals.*

**Themes verified by reading a sample of 25 call summaries (Jan–Jul 26):**

1. **Feature gaps block the full switch.** Recurring asks that stop an account committing: staff-level revenue and commission reporting, clock-in/out, staff permission levels, calendar column-per-staff view, selective client blocking, package and membership migration, intake forms. These are not objections to scheduling — they are reasons the account keeps its old system running alongside.
2. **Payment processor economics.** Stripe rates raised as a negotiation point rather than accepted as given.
3. **Base subscription price.** $149/month cited as unaffordable by an account under budget freeze — a whole-platform objection, not a scheduling one.
4. **Rollback on confusion.** At least one account asked for the Zoca booking system to be *revoked* "to reduce confusion and inefficiency" after enabling it. Complexity is causing reversal, not just stalling.
5. **Free is the wedge that works.** Where the pitch is framed as replacing a paid incumbent at no cost (one account migrating off Vagaro to cut monthly spend), it lands. Cost displacement is the strongest observed motivator.

---

## 5. What to conclude

1. **Scheduling converts well and retains badly.** 83% of starters get it switched on; 40% of those are still booking after 30 days, settling to ~20–25% per cohort. The work is not more pitching.
2. **The single highest-leverage fix is payments.** 71% skip it. Without it there are no deposits and no no-show protection, which is the reason a salon tolerates a booking system in the first place.
3. **$645,568 processed across 139 accounts** is the number worth carrying upward. It is the one figure here denominated in dollars and it is defensible.
4. **The pitch is recoverable, not recorded.** July 2026: 98 accounts pitched, 15 activated — a 15% pitch-to-activation rate. Recovering it required classifying 1,046 transcripts and mapping attendee emails to accounts. That works, but it is archaeology: it cannot be run as a live metric, it only covers the 53% of attendees whose email matches a customer record, and it will decay as staff and contact emails change.

## 6. To make this answerable next time

Cheapest first, in order:

1. **One field on the scheduling onboarding record:** `pitched_at`, `pitched_by`, `pitch_outcome`, `decline_reason` (enum). Populated at the point an AM offers it. Without this every future version of this question fails the same way.
2. **Backfill `entity_id` on Fireflies rows** by mapping `participants` / `organizer_email` to the account. 98% of call intelligence is currently unattributable — this unlocks all of it retrospectively.
3. **Find out why `cx.open_issues` and `cx.churn_potential` stopped writing on 14/01/26.** Two account-health tables going dark simultaneously two weeks before a major launch is either a broken job or a decommissioned pipeline. Either way the platform lost its qualitative feed at the worst moment.
4. **Instrument dormancy, not setup.** "Scheduling enabled" is the metric currently visible; "booked in the last 30 days" is the one that matters and is 2.5x smaller.

---

## Appendix — reproducing this

All figures from Metabase DB 7 (`Zoca Aurora`) via `POST /api/dataset`. Key joins:

- Account key for scheduling is `scheduling.onboarding.location_entity_id` → `scheduling.bookings.entity_id` → `chargebee.entity_customer_mappings.entity_id`. **Never join on `scheduling.onboarding.entity_id`.**
- Live account base: `chargebee.subscriptions.status in ('active','in_trial','non_renewing')` joined via `chargebee.entity_customer_mappings`.
- Native vs migrated bookings: `scheduling.bookings.migration_source is null`.
- Customer self-serve bookings: `created_by_type in ('EC','CLIENT')`.
