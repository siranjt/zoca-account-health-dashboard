# AM daily report — phase 2 handover

Branch `spec/am-daily-report-71869`. Phase 2 is **written but UNVERIFIED**: the
session that produced it could not execute `npm`, `npx`, `node <script>`, `curl`
or `git add` — every one was refused by the sandbox command policy. Nothing was
compiled and nothing was run against live data. Treat the numbers below as
intentions, not observations.

## What landed (uncommitted, in the working tree)

| File | Change |
|---|---|
| `src/lib/amReport.ts` | **new** — `computeAmSnapshot(): Promise<AmDailyRow[]>`, the port of `~/scripts/daily_am_report_detailed.py` |
| `src/lib/chargebee.ts` | added `listSubscriptions()`, `listInvoices()`, `chargebeeConfigured()` — book-wide paging on the existing `cbGet` client |
| `src/lib/metabase.ts` | added `metabaseBaseUrl()`, `runMetabaseCard()`, `fetchPublicQuestionCsv()`, `fetchPublicDashcard()` |
| `src/app/api/cron/am-report/route.ts` | `throw NOT_IMPLEMENTED` replaced with `computeAmSnapshot()` → `takeAmSnapshot()` |
| `src/app/api/cron/am-report/dry-run/route.ts` | **new, TEMPORARY — delete before merge.** Dev-only (404s when `NODE_ENV=production`), computes without writing |

No phase-1 file was modified.

## Verify before trusting it

```bash
npx tsc --noEmit          # must exit 0
npm run build             # must exit 0
npm run dev
curl -s localhost:3000/api/cron/am-report/dry-run | jq '{ms:.wallClockMs, rows:.amRows, totals}'
```

Expected, from the 03/08 workbook:

| Metric | Expect |
|---|---|
| `activeAccounts` | ~805 |
| `untouchedHuman30d` | ~187 |
| `schedOnboarded` | ~44 |
| `retentionRiskTickets` | ~67 |
| wall clock | target < 120s |

A 2x gap on any of these means a definition is wrong, not that data drifted.
Also check `.unassigned` is present with non-zero churn, and that
`.zeroBookRows[].churnPct30d` are all `null` rather than `100`.

Then delete `src/app/api/cron/am-report/dry-run/` and commit.

## Two judgement calls a reviewer should confirm

**1. Churn percentage denominator.** `amReport.ts` computes
`churned / (active + churned)` — the workbook's definition, and the one the five
backfilled days in `alfred.am_daily` already carry. It deliberately does **not**
call `churnPercentages()` from `amSnapshot.ts`, which divides by `active` alone.
The two differ by well under 0.1pp at book-level rates, but changing denominator
mid-series is exactly the silent step this table exists to make visible.
`churnPercentages()` now has no callers — either delete it or align it, but do
not leave a second definition sitting in the same module.

**2. `appchat_any` is not queried.** The Python runs it, but it feeds only the
detail sheet; it is absent from `STAFF` and therefore from both reported
untouched columns. Skipping it removes one large MV scan. If the per-account
Untouched detail is ever ported, it comes back.

## Deliberate design notes

- **Concurrency.** Chargebee's `offset` is an opaque cursor, so one stream
  cannot be parallelised. Four *filtered* streams run at once instead
  (`active`, `non_renewing`, `cancelled since the window`, `payment_due`
  invoices), and only in-window cancellations are fetched at all. Overdue
  invoices whose subscription falls outside those streams are resolved with
  `id[in]` in concurrent chunks.
- **Failure policy.** The compute throws rather than returning a partial set —
  including when a one-to-one touch channel returns zero rows for a non-empty
  book, and when either onboarding dashcard stops carrying the
  `Locations - Entity → Entity ID` column. Both were previously silent-zero
  paths. The route records the failure in `alfred.am_daily_run`.
- **Timeouts.** Every book-wide Chargebee page inherits the existing client's
  12s per-request timeout. That is tight for a daily job; if pages start
  flaking, that constant is the thing to raise.
- **Month boundary** uses the process's local time (`new Date(y, m, 1)`),
  matching the laptop job. On Vercel that is UTC; the laptop was IST. The two
  disagree for ~5.5 hours on the 1st of each month, on `churned_mtd` only.
- No message bodies are selected anywhere. `message_body` exists in
  `chat.app_chat_messages_mv` and is never touched.
