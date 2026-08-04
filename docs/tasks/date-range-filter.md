# Date-range filter for Impact and Activity

Add a calendar date picker alongside the existing preset buttons on `/admin/impact`
and `/admin/activity`. Presets stay; the picker sets an arbitrary range.

Scoped 04/08/26. Not yet built.

## Why it matters

The Impact page is the evidence half of this quarter's objective. A fixed "last 30 days"
answers "who used it lately"; an arbitrary range answers **"11 people across three teams
between 01/04/26 and 30/06/26"** — a sentence that survives being repeated in a room by
someone who never saw the demo. That is the point of the feature. Put the range in the CSV
filename and in the on-screen caption, or the number gets quoted without its period and
becomes unciteable.

## The decision that will cause a silent bug

`cave_activity_log.ts` is `timestamptz`. Every query today filters with an ABSOLUTE offset:

    WHERE ts > NOW() - make_interval(days => 30)

A date picker does not produce an offset — it produces **calendar dates**, and a calendar
date only means something in a timezone. Resolve "01/08/26" in UTC and the window actually
starts at 05:30 IST on the 1st and ends at 05:30 IST on the 5th. Nobody notices, the
numbers are simply wrong by a few hours of activity at both ends, and the page disagrees
with the workbook for reasons no one can reproduce.

Resolve both bounds in **IST**. `src/lib/istDate.ts` already exists for this — written this
session after the same class of bug put a snapshot on the wrong day. Reuse it; do not
re-derive the offset inline.

Boundaries: `from` inclusive at 00:00:00 IST, `to` inclusive of the whole day, i.e.
`ts >= from_ist AND ts < (to_ist + 1 day)`. Half-open at the top, so a range of
01/08 → 01/08 means that single whole day and consecutive ranges never double-count.

## Changes

### 1. `src/lib/impact.ts`
`getImpact(days = 30)` hardcodes `ts > NOW() - make_interval(days => ${d})` in **six**
places (~lines 76, 81, 88, 91, 93 and the coverage query). Change the signature to take a
resolved range and thread one predicate through all six:

    export async function getImpact(range: { fromUtc: Date; toUtc: Date }): Promise<ImpactReadout>

Keep `windowDays` on the readout — the UI prints it — but derive it from the range rather
than accepting it separately, so the caption can never disagree with the query. `EMPTY(days)`
needs the same treatment.

**Do not** leave a `days` overload alongside the range one. Two ways to express a window,
with the wrong one still exported, is how a future change silently uses the old definition
— see the `churnPercentages()` removal note in `src/lib/amSnapshot.ts` for the same trap.

### 2. `src/app/api/admin/impact/route.ts`
Currently `Number(searchParams.get("days")) || 30`, clamped 1..365. Accept `from` and `to`
(`YYYY-MM-DD`) and resolve them to UTC instants in IST. Keep `days` working — the preset
buttons and any bookmarked URL still send it — by converting it to a range server-side, so
there is exactly one code path below the parse.

Validate: reject a malformed date, and a `from` after `to`, with a 400 rather than clamping
silently. A clamped range returns plausible numbers for a window the user did not ask for,
which is worse than an error.

Cap the span (365 days is the existing ceiling; keep it) and put the resolved range in the
CSV filename: `cave-impact-2026-04-01_2026-06-30.csv`.

### 3. `src/app/api/admin/activity/route.ts`
Same treatment. Its defaults differ — `days` defaults to 7 and is capped at 90, not 365.
Keep those caps; they exist because this endpoint returns rows, not aggregates, and it
already has a `limit` of 500. A date picker makes it trivial to ask for a range that blows
past `limit` and silently truncates, so **surface the truncation** in the response
(`{ truncated: true, returned, limit }`) and say so in the UI. Silent truncation on a page
someone is using to count things is the same defect class as the 2000-row Metabase cap
logged in `am-report-OPEN-DEFECTS.md`.

### 4. `src/components/ImpactViewer.tsx` and `src/components/ActivityLogViewer.tsx`
- Keep the preset button group exactly as is. Clicking a preset sets the range and clears
  any custom selection; picking dates deselects the presets. One piece of state, not two —
  `{ from, to, preset: number | "custom" }` — so the buttons and the picker can never both
  look active.
- Two native `<input type="date">` fields. No date-picker library: `CLAUDE.md` bans chart
  libraries in favour of hand-built SVG, and the same reasoning applies — a native input is
  keyboard-accessible, localised by the browser, and adds nothing to the bundle.
- Set `max` on both inputs to today (IST). There is no activity in the future, and an
  accidental 2027 range returning zero rows reads as "nobody used it".
- Display every date `dd/mm/yy` per the repo convention, even though the input's own value
  is necessarily `YYYY-MM-DD`.
- The caption reads "Figures below cover the last N days." Change it to name the actual
  range, so a screenshot of the page carries its own period.
- Both viewers `fetch(..., { cache: "no-store" })` on state change — keep that; a cached
  range is indistinguishable from a wrong one.

## Verification

Neither page has tests, and neither does the repo. At minimum, prove by hand:

1. A single-day range (`from == to`) returns that whole day, not zero rows.
2. Two consecutive ranges sum to the range spanning them — proves the half-open boundary.
3. A preset and its equivalent explicit range return identical numbers — proves the two
   code paths converge.
4. A range crossing 00:00–05:30 IST returns the same count as the same range computed in
   the workbook. This is the one that catches the timezone bug, and the only check here
   that fails if the IST resolution is wrong.
5. On Activity, a range wide enough to exceed `limit` shows the truncation notice.

`npx tsc --noEmit` and `npm run build` both pass before pushing. Push to `main` deploys
production; there is no staging gate.
