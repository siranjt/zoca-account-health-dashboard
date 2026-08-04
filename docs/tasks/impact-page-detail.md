# Impact page: explain the numbers, then add the missing ones

`/admin/impact` shows six cards with bare labels — Distinct users, Accounts reviewed,
AM adoption, Alfred questions, CSV exports, Total events — and no statement of what any of
them counts or proves. This spec covers both halves: an explanation layer over what exists,
and the analysis that is missing.

Scoped 04/08/26. Not built.

## The test every change here has to pass

This page is not for the person who built it. It is for the person who has to make the case
in a room they are not in, to people who never saw the demo. So the test is: **can a reader
with thirty minutes and no context read this page and repeat one true sentence from it?**

Today they cannot. "Total events: 4,182" is not a sentence anyone can carry. "Eleven people
across three teams reviewed 247 accounts between 01/04/26 and 30/06/26, replacing the Retool
dashboard" is. Every item below either produces such a sentence or explains one.

## Part A — explanation layer

### A1. A plain-English lede above the cards
One generated sentence, in prose, stating the headline finding for the selected range:

> In **01/04/26 → 30/06/26**, **11 people** opened **247 distinct accounts** across
> **1,204 account views**, asked the AI analyst **86 questions**, and exported **19** CSVs.
> **6 of 8 account managers** used it at least once.

Build it from the readout already returned — no new query. It must degrade honestly: with
zero events, say so plainly rather than printing a sentence of zeros.

### A2. Per-metric definitions
Each card gets a definition covering three things: **what it counts, what it deliberately
excludes, and what it proves.** The pattern already exists — `AM_CONTEXT_NOTES` in
`src/lib/amMetrics.ts` does exactly this for the AM report, including naming each metric's
weaknesses. Reuse that shape; do not invent a second convention.

- **Distinct users** — individual humans with at least one event. Not sessions, not page
  views. Counted by `email`, so one person on two devices is one user. This is the N in the
  target sentence.
- **Accounts reviewed** — distinct `entity_id` opened at least once. The companion "opens"
  figure is the raw count, so 247 accounts / 1,204 opens means accounts were revisited —
  a stronger adoption signal than either number alone. Say that explicitly.
- **AM adoption** — AMs on the roster with ≥1 event, over roster size. The denominator is
  `ACCESS_CONTROL.ams`, so it moves when the roster moves; a drop can mean an AM left, not
  that usage fell. State this limitation on the card itself.
- **Alfred questions** — `alfred_asked` events, with distinct askers and distinct accounts
  discussed. Proves the AI analyst is used, not merely shipped.
- **CSV exports** — `csv_exported` events. The closest proxy for "this replaced a manual
  pull", which is the Retool comparison.
- **Total events** — every logged action. Least useful alone; it is the denominator for
  everything else and belongs last.

### A3. Say what is NOT measured
A short honesty note. The log records what happened inside the platform; it cannot show time
saved, decisions changed, or revenue affected. Naming a metric's weaknesses is what makes
the rest credible — the same reasoning already applied to the servicing-load index.

## Part B — new analysis

Ordered by value to the target sentence. Build in this order and stop when the budget runs
out; each stands alone.

### B1. Week-over-week trend per metric — HIGHEST VALUE
Adoption is a story about direction. One number is a snapshot; "distinct users went
4 → 7 → 11 over three months" is evidence of a tool taking hold. `daily[]` is already
returned and now buckets correctly in IST — aggregate into ISO weeks client-side, no new
query. Render with the existing hand-built SVG sparkline (`AmReport.tsx` has the pattern).
**`CLAUDE.md` bans chart libraries — do not add one.**

### B2. Repeat vs one-time users
Of the N distinct users, how many appeared on ≥2 distinct IST days? A tool eleven people
tried once is a demo; a tool six people use weekly is infrastructure. That single split is
the difference between those two claims, and it is one query:

    SELECT count(*) FILTER (WHERE d >= 2) AS repeat_users, count(*) AS any_users
    FROM (SELECT email, count(DISTINCT date_trunc('day', ts AT TIME ZONE 'Asia/Kolkata')) d
          FROM cave_activity_log WHERE <range> GROUP BY 1) x

Bucket in IST — see the misattribution fixed in `96687cb`.

### B3. Return curve
For users first seen in the range, how many came back in week 2, week 3, week 4. Answers
"did it stick" rather than "did they try it". More work than B2; do it only after B2.

### B4. Per-team split — BLOCKED, DO NOT START
**The data does not exist.** `ACCESS_CONTROL` holds `admins`, `managers` and `ams` — roles,
not teams — and `cave_activity_log` carries `role` and `am_name` but no team. The target
sentence claims "across CS, Finance and CX", and *the platform currently cannot prove that
clause.*

Prerequisite: add a `team` to each roster entry, then surface it. Treat as its own piece of
work. **Note the risk:** `ACCESS_CONTROL` is a hand-edited JSON env var, and on 04/08/26 two
missing characters in it took the entire platform down for every user. Do not restructure it
before the validation check listed in `am-report-OPEN-DEFECTS.md` lands.

### B5. Surface and event breakdown
`surface` is logged and never shown. Which parts of the platform get used tells you what to
build next — and what to retire. Cheap: extend the existing `eventBreakdown` query to group
by `surface`.

## Constraints

- **IST everywhere.** Any new day/week bucketing uses `AT TIME ZONE 'Asia/Kolkata'`. UTC
  bucketing drew ~38% of a day's events on the previous day until `96687cb`.
- **No chart library.** Hand-built SVG, per `CLAUDE.md`.
- **Entity-scoped, windowed queries.** Metabase has a 60s statement timeout, and the range
  picker now permits 365 days.
- **Admin-only.** The page and `/api/admin/impact` both check `role === "admin"`; keep both.
- **Degrade honestly.** A missing integration hides a section; it never prints a zero that
  reads as a measurement. That is the whole lesson of the `sched_*` NULL work.

## Verification

1. The lede sentence matches the cards for the same range — no independent recomputation.
2. Weekly trend bars sum to the window total (the check that caught the UTC bug).
3. Repeat-user count never exceeds distinct users; a single-day range yields zero repeats.
4. A range with no events renders the honest empty state, not a sentence of zeros.
5. `npx tsc --noEmit` and `npm run build` pass. Push to `main` deploys production.
