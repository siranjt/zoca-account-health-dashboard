# Impact census — `cave_activity_log`

Read-only census run 30/07/26. Source: Neon production, table `cave_activity_log`.
This is the "query the table before building on it" check. **Item 1 of the quarterly
objective is already built** (`src/lib/impact.ts`, `/api/admin/impact`,
`/admin/impact`) — what was missing was reading it.

## The headline

| Metric | Value |
|---|---|
| Total events | 1,007 |
| Distinct people | **19** |
| Distinct accounts opened | **62** (of ~831 = 7.5% of the book) |
| First event | 24/07/26 |
| Last event | 29/07/26 |
| **Span** | **5 days** |
| Roster size (ACCESS_CONTROL) | 28 → **19/28 = 68% adoption** |

## Role mix — this is the "three teams" proof

| Role | People | Events |
|---|---|---|
| admin | 2 | 454 |
| manager | 9 | 306 |
| am | 10 | 247 |

## Event breakdown

| Event | Count | People |
|---|---|---|
| page_view | 418 | 17 |
| tab_viewed | 181 | 11 |
| account_opened | 137 | 14 |
| filter_changed | 83 | 10 |
| search | 74 | 7 |
| alfred_asked | 53 | 12 |
| sign_in | 28 | 15 |
| window_changed | 16 | 3 |
| digest_sent | 8 | 8 |
| sign_out | 7 | 2 |
| digest_click | 2 | 1 |
| **csv_exported** | **0** | 0 |

## What this does and does not prove

**Proves — N in the target sentence.** 19 distinct people across admin/manager/AM
in the first five days, 68% of the provisioned roster. That is a strong adoption
number and it is defensible today.

**Does not prove — X and Y (review time before/after).** The log carries no
duration and there is no Retool baseline anywhere. Time-per-review is *not*
sitting in this table, contrary to the plan's assumption. It would have to be
derived from inter-event gaps, and there is still no "before" to compare to.
Deriving a "Y" with no "X" is a half-metric; do not ship it as one.

**The binding constraint is age, not thinness.** Logging shipped 24/07/26
(`git log src/lib/activity.ts`). The instrument has been running six days. The
rate is healthy; the *cumulative* figures (62 accounts, 0 exports) will read as
weak to a room that doesn't know the window. Any document must lead with the
window.

## Consequences

1. **Do not re-build item 1.** It exists. The ~8h estimate is spent.
2. **Let it run.** At the current rate, 30 days of log gives a credible cumulative
   coverage figure. Re-run this census on ~24/08/26 before writing anything for
   the manager to carry upward.
3. **`csv_exported = 0` is a finding.** Either the export is undiscoverable or
   nobody wants it. Worth one question to a user, not a rebuild.
4. **Drop "cutting account review from X to Y" from the target sentence** unless a
   Retool baseline can be sourced from someone's memory or an old ticket. It
   cannot be sourced from this database.

## Reproducing

Read-only, no DDL. Census script was throwaway; the same aggregates are served by
`getImpact()` in `src/lib/impact.ts` and `/api/admin/impact?days=N` (admin only,
`?format=csv` for the per-person table).
