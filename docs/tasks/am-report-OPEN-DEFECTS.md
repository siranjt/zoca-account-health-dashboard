# AM daily report — open defects before merge

State as of 04/08/26. Branch `spec/am-daily-report-71869`, 7 commits, **nothing pushed,
nothing deployed, the cron has never fired**. `tsc --noEmit` and `npm run build` both pass.

Issue: #1. Spec: `~/Downloads/am-report-app-spec.md`.

## How this list was produced

Three specialist reviews found 10 criticals in the built branch. Six were fixed
(`e55c3c0`, `b9bf44c`). A fourth review, of the fixes themselves, found 3 more — one of
which silently negates the fix it shipped with. **Every round found defects the previous
round's verification missed.** Assume this list is incomplete.

---

## P1 — FIXED 04/08/26, verified against production rows

All three below are fixed, plus a fourth that only surfaced when the fix was actually
verified rather than reasoned about: **`companyTotal()` summed with `?? 0`**, so the
company row — the top line of the table — rebuilt the same fake zero one level above the
per-AM rows it had just been removed from. A metric with any unmeasured contributor is
now NULL rather than a partial sum.

Verified by running `parseTrend` + `companyTotal` + `formatMetric` over the real
`alfred.am_daily` rows: 28/07 renders blank at AM and company level, 29/07 renders its
measured 106, and a measured `0` on 29/07 still renders `0`. `tsc` and `build` both exit 0.

Kept below because the reasoning is the useful part.



### 1. The nullable `sched_*` migration does not reach the page
`src/lib/amMetrics.ts:309`

`parseTrend()` reads the four `sched_*` columns through `int()`, which collapses `NULL`
to `0`. The write side, the DDL migration and the production repair of 28/07 are all
correct and verified in the database — and the page still renders the fake 0 -> 106 cliff
on 29/07 that the whole fix existed to remove.

Downstream plumbing already handles null (`formatMetric` returns blank, `deltaFor` returns
kind `blank`, `companyTotal` uses `?? 0`). The two churn percentages one line above already
use `num()` for exactly this reason.

**Fix:** use `num()` not `int()` for `sched_provisioned`, `sched_product_active`,
`sched_onboarded`, `sched_incomplete`. Extend the comment at :303 to name all six nullable
metrics rather than two.

**Verify:** load `/am-report` and confirm 28/07 shows blank scheduling cells, not zeros.

### 2. DDL runs on every page read
`src/lib/amSnapshot.ts:83`

The idempotent `ALTER` loop sits inside `ensureTables()`, which `getAmTrend()`,
`getAmRuns()` and `beginAmRun()` all await. `src/app/am-report/page.tsx:73` calls the first
two in a `Promise.all`, so **one page render issues 16 `ALTER TABLE` statements** across two
Neon sessions, each taking an `ACCESS EXCLUSIVE` lock. The export route does the same.

`ALTER TABLE` requires table ownership. If the app's Neon role does not own
`alfred.am_daily`, every read path throws permission denied where `CREATE TABLE IF NOT
EXISTS` was a harmless no-op — the report page becomes a 500.

**Fix:** run the migration once. Module-level `let migrated = false`, or gate on an
`information_schema.columns` check of `is_nullable`, or move it to a path only
`takeAmSnapshot()` reaches. Read paths must not execute DDL.

### 3. The Chargebee retry made the failure mode worse
`src/lib/chargebee.ts:58`

`cbListAll` pages sequentially. Under sustained 429/5xx each page now costs up to
3 x 12s timeout + ~3s backoff (~39s) where it previously cost 12s and failed fast. Eight
pages exceeds `maxDuration = 300`. **A Vercel hard kill does not run the route's catch
block**, so `finishAmRun()` never fires and the run row is left `finished_at = NULL,
error = NULL` — destroying the failure record the design exists to preserve.

**Fix:** budget retries against the whole run, not one request — thread a deadline
(`started + 240s`) into `cbGet` and stop retrying past it, or drop to 2 attempts. Separately,
wrap the route body so a near-deadline abort still writes `finishAmRun()`.

---

## P2 — found in round one, never fixed

### 4. Zero-row tripwire covers only human channels
`src/lib/amReport.ts:308` — the guard fires for `appchat_staff`, `calls`, `meetings` only.
If the Gmail or CallHippo-messages query hits Metabase's 60s statement timeout and returns
200 with an empty array — *the exact failure shape that already shipped once in the Python* —
the run succeeds and `untouched_all_30d` silently inflates toward the whole book, as a
stored and charted metric.
**Fix:** apply the guard to every channel in `ALL_CHANNELS`. Email reaches ~92% of the book;
zero rows there is never legitimate.

### 5. 2000-row Metabase cap unguarded
`src/lib/amReport.ts:298` and `runMetabaseCard` (card 1335). Each touch query returns one row
per touched entity; `/api/dataset` caps at 2000. The book is ~805 today. Past 2000, every
query silently truncates and the overflow counts as untouched. The zero-row guard catches
emptiness, not truncation.
**Fix:** throw when `rows.length >= 2000`. Longer term, chunk the book into batches of ~1500.

### 6. AM identity is a display name
`src/lib/amSnapshot.ts:71` — `PRIMARY KEY (snapshot_date, am_name)`. A rename in BaseSheet
forks that AM's history into two identities: the old name stops appearing, a new one appears
with a full book, deltas show a total collapse plus a total appearance, and nothing detects
it. Unrecoverable once the old name is forgotten.
**Fix:** key on a stable id (BaseSheet row id or email) with `am_name` as display. Minimum
viable: compare today's name set to yesterday's and alert when one disappears as another
appears.

### 7. Phone matching has no minimum-length guard
`src/lib/amReport.ts:243` — `RIGHT(regexp_replace(...), 10)` on a value shorter than 10
digits returns the whole short string, so extensions, placeholders and empty strings can
collide. False matches *shrink* the untouched list — the same direction of error that made
the SMS problem invisible for four days.
**Fix:** `AND length(regexp_replace(phone_number,'\D','','g')) >= 10` on both sides.

---

## Smaller, documented, not urgent

- `AmDailyRow`'s four `sched*` fields are typed `number` while the columns are nullable.
  No runtime issue (the only TS writer always measures all four), but the type now
  understates the schema.
- `scripts/backfill-am-daily.mjs:197` — the `NULLABLE_FIELDS` preflight also lists `mrr` and
  `missedPaymentAmount`, which are `?? 0`-coerced and can never be null. It aborts on a
  workbook missing those columns where it previously wrote 0.
- Three pre-existing digest routes (`activity-digest`, `am-digest`, `lead-drought-digest`)
  still use the fail-open `if (secret)` pattern. Same `/api/cron` exemption, same class.
  `src/lib/cronAuth.ts` exists; they just need migrating.
- The export route's 503 branch still names `CRON_SECRET` in the body — a configuration
  oracle. `cronAuthFailure` already solves this; the route predates it.
- `pct()` in `amSnapshot.ts:97` is dead code using the wrong denominator.
- `middleware.ts:41` returns early for any path with a file extension, before the owner-only
  check at :44. No owner-only route has an extension today, so it is not exploitable — but
  the ordering is wrong and the next such route inherits a bypass.
- **Zero tests.** ~3,100 insertions, no test framework in the repo. Nothing pins the
  null-churn rule, `(unassigned)` preservation, or upsert idempotency.

## Verified sound — do not re-litigate

- `sql.transaction()` accepts lazy tagged templates and runs one HTTP transaction
  (`@neondatabase/serverless` 1.1.0, checked in `node_modules`).
- The zero-row guard precedes `ensureTables()`, so nothing throws after a committed DELETE.
- `crypto.subtle` is a Node 18+ global; neither cron route opts into edge runtime.
- **Vercel Cron sends `Authorization: Bearer $CRON_SECRET`** — the fail-closed auth does not
  break the crons.
- `istMonthStartUnix` is correct across month boundaries and in the 00:00–05:30 IST window.
  India has had no DST since 1945.
- The retry wraps GETs only; no non-idempotent call is repeated.
- The new `a` (accountManager) key on `book_daily` is safe: `getActivity()` diffs only
  `c, t, o, m`, so no spurious change events on the first day it appears.

## Merge gate

Do not merge before items 1–3. Item 1 in particular means the branch currently ships a
metric that renders a movement which never happened, which is the failure this project was
built to stop.
