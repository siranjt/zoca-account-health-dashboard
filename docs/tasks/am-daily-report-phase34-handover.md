# AM daily report — phases 3 and 4 handover

Phase 1 stored the snapshot, phase 2 ported the compute. This is the readout
(`/am-report`) and the rewiring of the Python workbook to read it.

## What was built

| Path | What it is |
| --- | --- |
| `src/lib/amMetrics.ts` | The metric catalogue (labels, formats, direction, definitions) and the **pure** view model. No source-system access, no `server-only` import. |
| `src/components/AmReport.tsx` | The whole readout: freshness banner, today table, company trend grid, per-AM trends, run log, definitions. A **server** component — the page ships no JavaScript for the table or the charts. |
| `src/app/am-report/page.tsx` | Owner-only page. Reads `getAmTrend()` / `getAmRuns()` and renders. |
| `src/app/api/cron/am-report/export/route.ts` | Read-only JSON of one snapshot day, for the Python workbook. |
| `src/middleware.ts` | Owner-only prefix list; a real HTTP 403 for signed-in non-admins. |
| `src/app/globals.css` | `--am-good/bad/warn/flat` tokens (contrast-checked on both themes) and the stale-banner pulse. |
| `~/scripts/daily_am_report_detailed.py` | Summary sheet now READS the snapshot; detail sheets still compute and now act as a cross-check. |

## Decisions worth knowing

**The endpoint, not a direct Neon connection.** The Python script has no
Postgres driver and no `DATABASE_URL`. Direct access would mean a new dependency
plus a database credential on a laptop, for a job that only reads. The script
already speaks HTTP through `curl` for Chargebee and Metabase, so the endpoint
adds no import, and it exercises the same read path the page uses — a break
shows up in one place instead of two.

**It lives under `/api/cron/`** because `src/middleware.ts` exempts only that
prefix from the SSO redirect. Anything else would be bounced to `/signin`, which
is exactly how the snapshot cron failed silently for twelve days (fixed in
`bb82584`).

**Its bearer secret is required, not optional.** The sibling cron route skips
its check when `CRON_SECRET` is unset. That is tolerable for a scheduled writer
and not for an endpoint that hands out the whole book, so this one returns 503
rather than opening. An unauthenticated production data route was removed once
already (`ca0ad0e`).

**403 comes from the middleware, not the page.** Next 14 has no way for a page
to set a status code (`unauthorized()` is Next 15). A non-admin redirected to
`/overview` — which is what the other admin pages do — cannot tell "you may not
see this" from "that page moved". The page keeps a second, redundant guard;
duplication is worth it on an auth path.

**When SSO is not configured, the page stays shut.** In that state no role
exists for anyone, so "owner only" cannot be enforced and the shared
`DASHBOARD_PASSWORD` holder is not the owner. Both the middleware and the page
fail closed. This is the CLAUDE.md hard rule: never degrade an auth path.

**The company total row is the only figure derived on the page.** Counts and
amounts are summed from the stored per-AM rows. The two churn percentages are
re-derived as `sum(churned) / (sum(active) + sum(churned))` — the workbook's own
TOTAL formula — because averaging per-AM percentages would weight a one-account
book like a two-hundred-account book. This is stated in the Definitions section
on the page itself, not only here.

**Deltas across a `metric_version` change are suppressed.** They render `def.`
in warning ink rather than a number, and the trend line carries a dashed marker.
The 182 → 110 step on 03/08 was SMS leaving the definition; an unmarked delta
there reads as a service collapse.

**Each small multiple prints its own range.** Independent y-scales are required
(twelve series on one axis is unreadable) but an independent scale makes a small
swing look large, so the min–max is printed under every chart rather than
implied.

## The limit on the Python rewire — read this

The snapshot stores **per-AM aggregates only**. It has no account-level rows, so
it cannot answer "which accounts". Therefore:

- **Summary sheet** — reads the snapshot. This is the sheet whose numbers get
  quoted, and it can no longer disagree with `/am-report`.
- **The other seven sheets** — still computed locally from Chargebee, Metabase
  and Linear, because the detail they carry does not exist in the snapshot.

So the script still fetches from source; what changed is that its own aggregate
(`agg`/`T`) is no longer a second source of truth for the headline numbers. It
is now a **cross-check**: `reconcile()` compares the live totals against the
snapshot's TOTAL and prints any disagreement at the top of the Summary sheet and
in the run log. Money is compared with a tolerance; counts exactly.

Fully eliminating the second implementation would mean storing account-level
snapshot rows. That is a schema change and was not in scope here.

**Timing.** This job and the app's cron are both scheduled at 17:30 IST and the
app's compute takes about 40 seconds, so the script would otherwise race the
write. It now asks for *today's* snapshot, waits up to ~3 minutes if the day is
not written yet, and only then falls back to the newest stored day — with the
fallback stated on the Summary sheet. The fetch happens after the Chargebee and
Metabase pulls, so on a normal day the wait costs nothing.

**Failure is loud, not silent.** If the snapshot cannot be read the workbook is
still produced, but the Summary sheet opens with `!! SNAPSHOT UNAVAILABLE` and
says it fell back to a local computation.

## Configuration needed before this runs

- `CRON_SECRET` must be set in Vercel (it already is) **and** available to the
  laptop job — via `~/.zshrc` (`export CRON_SECRET=...`) or the environment.
- `APP_BASE_URL` is optional; the script defaults to the production URL.

Without both, the script logs `APP_BASE_URL or CRON_SECRET is not set` and falls
back to computing the Summary locally.

## NOT VERIFIED

Every execution command in the session that produced this — `node`, `npm`,
`npx`, `python3`, and the local `tsc` binary — was denied by the environment's
permission layer. So the following were **not** run and must be run before this
is trusted:

```bash
npx tsc --noEmit          # must exit 0
npm run build             # must exit 0
npm run dev               # then load /am-report
python3 ~/scripts/daily_am_report_detailed.py
```

Specifically unverified:

1. TypeScript compiles.
2. The build passes.
3. The page renders today's rows from Neon.
4. A zero-book AM shows a blank churn % (the *code path* is explicit — `null`
   flows from the database through `parseTrend` untouched and renders an empty
   cell — but it has not been seen on screen).
5. `(unassigned)` renders with its churn and ticket counts.
6. The freshness banner shows a real timestamp, and the loud stale state.
7. The trend grid renders and the v0/v1 boundary is marked.
8. The rewired workbook's Summary totals match the snapshot.

To simulate staleness for check 6 without touching real data, move the newest
successful run backwards:

```sql
UPDATE alfred.am_daily_run SET finished_at = now() - interval '40 hours'
WHERE snapshot_date = (SELECT max(snapshot_date) FROM alfred.am_daily_run WHERE ok);
```

The banner should switch to the red `STALE` state with the hour count. Revert by
re-running the cron for that date.
