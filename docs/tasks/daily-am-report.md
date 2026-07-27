# Task: daily AM-level report — six metrics

**Requested:** 27/07/26. Daily, per account manager:
missed payments · churn percent · retention-risk tickets · active tickets ·
active users on payments and scheduling · accounts not touched in the last 30 days.

**Status:** spec. Not started. Two definitions and one source decision are open — see
[Blockers](#blockers). Do not write code before they are closed.

---

## Prior art — do not rebuild this

An AM-level digest already exists and ships. Read it before touching anything:

| Piece | Location |
|---|---|
| Digest engine, per-AM, categorised | `src/lib/digest.ts` → `buildAmDigests(topN?)` |
| Email render | `src/lib/digest.ts` → `renderDigestEmail(d)` |
| Transport | `src/lib/digestSend.ts` |
| AM scoping | `src/lib/scope.ts` → `scopeAccounts()`, keyed on `AccountRow.accountManager` |
| Roster | `src/lib/access.ts` → `listRoster()` |
| Click attribution | `/api/digest/click`, signed via `signClick()` / `trackedLink()` |
| Impact readout | `src/lib/impact.ts` → `getImpact(days = 30)` |

`buildAmDigests` already produces, per AM: `totalAtRisk`, a round-robin sample of accounts
grouped by primary problem (`billing` / `leads` / `visibility` / `reviews` / `rankings` /
`engagement`), each with a reason string, MRR, and a tracked link.

**So this request is not a new report.** What the digest lacks is a *scoreboard* — the current
digest is a per-AM **list of accounts**; the six requested metrics are per-AM **counts and
rates**. The work is a summary block at the top of the existing digest, fed by the same
`getAccountsPayload()` call. Nothing new gets plumbed.

## Metric → source map

Field names verified against `src/lib/types.ts` → `AccountRow`.

| # | Metric | Source | State |
|---|---|---|---|
| 1 | Missed payments | `daysOverdue`, `failedPayments` | **Ready.** Same fields `classify()` already uses for the `billing` category. |
| 2 | Churn percent | none in `AccountRow` | **Blocked — structural.** See below. |
| 3 | Retention-risk tickets | `src/lib/tickets.ts` | **Undefined.** No risk label/category exists on the row; only counts. |
| 4 | Active tickets | `openTickets` (Linear: Todo / In Progress / In Review) | **Ready.** |
| 5 | Active users — payments & scheduling | scheduling: `bookOnlineActive`, `bookOnlineClicks`. Product set: `activeProducts`. Adjacent: `webAppActive`, `ccEnabled`, `ccActiveDaysL28`, `ccSegment` | **Partly ready.** "Scheduling" maps to book-online. "Payments" is undefined — see below. |
| 6 | Not touched in 30 days | `lastConnected` (HubSpot last-connected date) **or** multi-channel last touch in `src/lib/comms.ts` | **Source decision required.** See below. |

## Blockers

**1. Churn — RESOLVED 27/07/26. Working, measured against live data.**

Decisions recorded: Chargebee `cancelled` **is** true churn (owner's call, 27/07/26). AM
attribution is **the AM assigned to the account** (owner's call, 27/07/26) — not ownership
reconstructed at cancellation time.

Method: Chargebee `GET /subscriptions` with `status[is]=cancelled` + `cancelled_at[after]`
→ `cf_entity_id` → AM via BaseSheet (card 1335), falling back to `cx.am_mapping` →
`entities.employees`. Probe: `churn_by_am.py` (session scratchpad; port into the repo when wired).

Verified figures, 30-day window ending 27/07/26:

| Measure | Value |
|---|---|
| Active accounts (distinct entities) | 819 |
| Subscriptions cancelled | 77 (across 75 entities) |
| Fully churned accounts (no active sub left) | 62 |
| Partial (cancelled one sub, still active) | 13 |
| 30-day account churn | 7.0% |
| `cf_entity_id` coverage | 77/77 cancelled · 925/925 active |
| AM mapping, active accounts | 818/819 |

**Report account churn, not subscription churn.** 77 cancellations are 62 churned accounts;
using 77 overstates churn by 24%.

**Daily churn percent per AM is still a bad metric** — an AM churns nobody most days and one
cancellation spikes the rate. Use a **30-day rolling** figure displayed daily.

### Calendar-month churn (added 27/07/26, owner's request)

A month runs 1st 00:00 → 1st 00:00. Denominator is accounts with ≥1 subscription active **at
the month start**, reconstructed from `activated_at`/`started_at` and `cancelled_at` — not
today's book. Numerator is those accounts holding no active subscription by month end.
Probe: `month_churn.py`. Source: 2,737 subscriptions, all statuses.

| Month | Active @ start | Churned | Churn % |
|---|---|---|---|
| Aug 25 | 618 | 23 | 3.7% |
| Sep 25 | 739 | 54 | 7.3% |
| Oct 25 | 888 | 83 | 9.3% |
| Nov 25 | 1009 | 115 | 11.4% |
| Dec 25 | 1007 | 89 | 8.8% |
| **Jan 26** | 1038 | **179** | **17.2%** |
| Feb 26 | 916 | 93 | 10.2% |
| Mar 26 | 899 | 69 | 7.7% |
| Apr 26 | 907 | 65 | 7.2% |
| May 26 | 902 | 61 | 6.8% |
| Jun 26 | 887 | 93 | 10.5% |
| Jul 26 | 839 | 33 | 3.9% (MTD, to 27/07) |

**The book peaked at 1,038 accounts in Jan 26 and is 839 today — down 19% in six months.**
Churn improved Feb→May then re-accelerated in June to 10.5%.

**Jan 26 needs explaining before this series is shown to anyone.** 179 churned accounts in one
month is 2.5× the trailing average; it is either a real event (pricing, a cohort renewal) or a
Chargebee bulk operation. Do not publish the series until that month is understood.

**Caveat — coverage.** 342 of 2,737 subscriptions (12.5%) lack `cf_entity_id` or a start
timestamp and are excluded, so monthly figures may undercount. The 30-day probe found 100%
coverage on recent records, so the gap is concentrated in older subscriptions.

**Caveat — per-AM counts are not per-AM rates.** The matrix below counts churned accounts by
*current* assignment. Counts favour whoever holds the biggest book, and applying today's
assignment to historical churn is anachronistic. Per-AM month denominators (each AM's active
book at month start) are required before any AM comparison is published.

Churned accounts by AM, last 6 months (counts, not rates):

| AM | Feb | Mar | Apr | May | Jun | Jul | Total |
|---|---|---|---|---|---|---|---|
| Kanak sharma | 20 | 5 | 3 | 8 | 13 | 4 | 53 |
| Bikash Mishra | 2 | 4 | 4 | 14 | 10 | 6 | 40 |
| Sudha Goutami | 4 | 6 | 12 | 6 | 7 | 3 | 38 |
| Hubern C | 4 | 7 | 9 | 4 | 9 | 1 | 34 |
| Atharv Y | 0 | 2 | 4 | 9 | 13 | 2 | 30 |
| Siddhi Shetty | 8 | 8 | 3 | 4 | 6 | 1 | 30 |
| Anu Srivastava | 4 | 9 | 5 | 4 | 3 | 4 | 29 |
| (unassigned) | 7 | 3 | 4 | 1 | 9 | 3 | 27 |
| Santhosh V | 14 | 5 | 6 | 1 | 1 | 0 | 27 |
| Shruti Sinha | 0 | 0 | 4 | 4 | 10 | 4 | 22 |
| Sakshi Mamgain | 2 | 5 | 2 | 2 | 5 | 4 | 20 |
| Others (7 AMs) | 28 | 15 | 9 | 4 | 7 | 1 | 64 |
| **Total** | **93** | **69** | **65** | **61** | **93** | **33** | **414** |

**Known data-quality finding: half of churn has no live owner.** Of 62 churned accounts, only
30 sit with an AM who still has a book. The rest split into 19 with no AM assignment in either
source, and 13 assigned to three AMs holding zero active accounts (Shruti Sinha 8, Atharv Y 4,
Santhosh V 1). Assignment appears to be cleared when an account cancels. Consequences for the
report: show `(unassigned)` as its own row, and **suppress the percentage wherever the active
book is 0** — a 100% churn rate on an empty denominator is noise that will be read as blame.

**2. Retention-risk tickets — RESOLVED 27/07/26.** Superseded my `health.tier` proposal; the
owner's Metabase query already carries the fields. Public CSV:
`metabase.zoca.ai/public/question/a3f0ebc6-c0fd-4a0f-a000-2e4d5fd0e781.csv`

90 open tickets (04/12/25 → 24/07/26). Columns include `entity_id`, `am_name`,
`ticket_category`, `ticket_classification`, `churn_potential_status`, `state_name`.

- `ticket_classification`: Retention Risk Alert 51 · Churn Ticket 23 · paid_user_offboarding 11
  · Subscription Support 4 · Subscription_Cancellation 1
- `churn_potential_status`: POTENTIAL 55 · blank 34 · FALSE_ALERT 1
- `state_name`: Todo 79 · In Progress 6 · In Review 5 — **open states only**, which is what a
  daily report wants
- 17 rows have a blank `am_name`; 3 have a blank `entity_id`

Definition: group by `am_name` where `ticket_classification` is `Retention Risk Alert` or
`Churn Ticket`; exclude `churn_potential_status = FALSE_ALERT`. Row counts come from a CSV
parser, not `wc -l` — the `description` field contains embedded newlines (raw line count reads
3,408 against 90 real rows).

**3. "Active users on payments" has no definition.** Ambiguous between: accounts paying
successfully (billing state — derivable from `daysOverdue` / `failedPayments`), and end-users of
a payments *product* (needs a product label in `activeProducts`, and confirmation the product
exists and emits usage).

**4. Last-touch source is a cost decision.** Repo `CLAUDE.md`: *"Last touch is the max across
all channels (chat, calls, SMS, email, meetings, HubSpot), not HubSpot alone."* `AccountRow`
carries only HubSpot's `lastConnected`, so counting untouched accounts from it **overstates**
the number — a client called yesterday but not logged in HubSpot reads as untouched.
The true multi-channel figure lives in `comms.ts`, against tables `CLAUDE.md` flags as
200K–800K rows with a 60s Metabase timeout and a 10-minute cache.

Two options: **(a)** HubSpot-only, cheap, wrong in a known direction — label it
*"no HubSpot touch in 30d"* and be honest about it; **(b)** true multi-channel, correct, needs a
batched entity-scoped query that respects rule 5 (equijoins, windowed) and probably a
precomputed daily snapshot rather than live fetch. **Recommendation: (b) via a daily snapshot**,
because an untouched-accounts list that is wrong is worse than no list — an AM who gets a false
name once stops trusting the whole digest.

## Implementation shape (once unblocked)

1. `src/lib/digest.ts` — add `interface AmScoreboard` and `buildAmScoreboard(accounts)`, pure,
   computed from the already-scoped `AccountRow[]`. No new fetches for metrics 1, 3(b), 4, 5.
2. Churn + true last-touch — separate sources; fold into the same payload as precomputed fields
   so the scoreboard stays pure and testable.
3. `renderDigestEmail()` — scoreboard row above the existing category groups. Keep it plain;
   this reaches real inboxes and carries no product theming (per repo `CLAUDE.md`).
4. Ship behind `DIGEST_SCOREBOARD=1` so the digest cannot regress for AMs while it settles.
5. Gates before push: `npm run build` and `npx tsc --noEmit`. `main` auto-deploys production.

## Why this is on the evidence path

The digest already routes every link through `/api/digest/click` and logs it as adoption
evidence. Adding a scoreboard increases digest usefulness, which increases click-through, which
feeds `getImpact()` — the same instrument objective item 1 exists to read. This extends the
evidence work rather than competing with it.

## Not decided

- Hours per week available for this. Nothing gets scheduled until that number exists.
- Whether the daily send is email, Slack, or both (transport is already agnostic).
