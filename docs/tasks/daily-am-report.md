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

**1. Churn cannot be computed from the book.** Repo `CLAUDE.md`: *"The book excludes churned
accounts — no `cx.health_score` row, no appearance."* A churned account disappears from
`getAccountsPayload()` entirely, so churn is not a filter over existing rows — it needs a second
source (Chargebee cancelled/non-renewing subscriptions, or Aurora directly).

Separately, **daily churn percent per AM is a bad metric.** With ~831 accounts across the
roster, an AM's daily churn is 0 most days and one cancellation spikes it to a meaningless
percentage. Recommend **30-day rolling churn**, shown daily. Same query cost, a number that
means something.

**2. "Retention-risk tickets" has no definition.** Options: (a) a Linear label, (b) tickets on
accounts whose `health.tier` is `at_risk` / `critical`, (c) a ticket age/priority threshold.
(b) needs no Linear change and reuses the health tier already on the row — cheapest and
defensible. Decide before coding.

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
