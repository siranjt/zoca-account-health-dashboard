// The AM daily report runs on IST, end to end: the cron fires at 17:30 IST, the
// backfilled workbook days are IST dates, and the team reads "yesterday" as an
// IST day. Deriving a date from UTC (`toISOString().slice(0,10)`) or from the
// process's local time agrees with that only between 00:00 and 18:30 UTC. A
// manual run or a Vercel retry between 18:30 and 24:00 UTC — 00:00 to 05:30 IST,
// the small hours of the *next* IST day — lands on YESTERDAY's date and
// overwrites a snapshot that is already correct.
//
// So there is exactly one date helper for this feature, and everything that
// stamps or compares a snapshot_date uses it. No `server-only`: the page
// component reads it too.

const IST_TZ = "Asia/Kolkata";

/** `YYYY-MM-DD` as it reads in IST. Defaults to now. */
export function istDate(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

/**
 * Unix seconds at 00:00 IST on the 1st of the IST calendar month containing
 * `d` — the boundary `churned_mtd` counts from. Built from the IST date parts
 * with an explicit +05:30 offset so the result never depends on the
 * environment's timezone (a Vercel lambda runs UTC; the laptop it replaced ran
 * IST, and the two disagree for the first 5.5 hours of every month).
 */
export function istMonthStartUnix(d: Date = new Date()): number {
  const [year, month] = istDate(d).split("-");
  return Math.floor(Date.parse(`${year}-${month}-01T00:00:00+05:30`) / 1000);
}

/** True for a well-formed `YYYY-MM-DD` naming a real calendar day. Rejects
 *  "2026-02-30" and "2026-13-01", which Date.parse would otherwise roll forward
 *  into a different month without complaining. */
export function isIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00+05:30`);
  return Number.isFinite(t) && istDate(new Date(t)) === v;
}

/**
 * The instant 00:00:00 IST on `date` (`YYYY-MM-DD`), as a UTC Date.
 *
 * A date picker hands back a CALENDAR DAY, and a calendar day only means
 * something in a timezone. `cave_activity_log.ts` is timestamptz, so comparing
 * it against a bare date resolves in UTC — "2026-08-01" would then begin at
 * 05:30 IST on the 1st, and every range would quietly lose the first five and a
 * half hours at each end. Nobody notices; the page just disagrees with the
 * workbook. The explicit +05:30 fixes the boundary to the same instant whatever
 * timezone the process runs in (Vercel is UTC, the laptop this replaced was IST,
 * and they disagree for exactly those hours).
 */
export function istDayStartUtc(date: string): Date {
  return new Date(`${date}T00:00:00+05:30`);
}

/** 00:00:00 IST on the day AFTER `date`. Ranges are half-open — `ts >= from AND
 *  ts < after(to)` — so `from == to` covers that one whole day, and two
 *  consecutive ranges can never double-count the boundary between them. */
export function istDayAfterUtc(date: string): Date {
  return new Date(istDayStartUtc(date).getTime() + 86_400_000);
}

/** A window resolved to absolute instants, plus the IST calendar days it came
 *  from (for captions and filenames). Half-open: `ts >= fromUtc AND ts < toUtc`. */
export interface DayRange {
  fromUtc: Date;
  toUtc: Date;
  fromDate: string;
  toDate: string;
}

/**
 * Resolve `?from=&to=` (IST calendar days) or `?days=N` (rolling window) into one
 * DayRange. Both endpoints that take a window call this, so the timezone rule
 * exists in exactly one place — the spec for this feature calls out re-deriving
 * the offset inline as the way the bug comes back.
 *
 * `days` is kept because the preset buttons and any bookmarked URL still send
 * it, and it is converted here rather than downstream, so there is a single code
 * path below the parse.
 *
 * Returns an error INSTEAD OF CLAMPING for a malformed date or an inverted
 * range. A clamped range answers a question the user did not ask with numbers
 * that look plausible; a 400 is louder and cheaper to debug.
 */
export function resolveDayRange(
  params: URLSearchParams,
  opts: { defaultDays: number; maxDays: number },
): { ok: true; range: DayRange } | { ok: false; error: string } {
  const from = params.get("from");
  const to = params.get("to");

  if (from || to) {
    if (!from || !to) return { ok: false, error: "both from and to are required" };
    if (!isIsoDate(from) || !isIsoDate(to)) return { ok: false, error: "from and to must be YYYY-MM-DD calendar dates" };
    if (from > to) return { ok: false, error: "from must not be after to" };
    const fromUtc = istDayStartUtc(from);
    const toUtc = istDayAfterUtc(to);
    const span = Math.round((toUtc.getTime() - fromUtc.getTime()) / 86_400_000);
    if (span > opts.maxDays) return { ok: false, error: `range is ${span} days; the maximum is ${opts.maxDays}` };
    return { ok: true, range: { fromUtc, toUtc, fromDate: from, toDate: to } };
  }

  const raw = params.get("days");
  const days = Math.min(opts.maxDays, Math.max(1, Number(raw) || opts.defaultDays));
  // A rolling window ends at the end of TODAY in IST, not at this instant —
  // otherwise "7 days" silently means six days plus however far into today we
  // are, and the daily chart's last bar is always short.
  const today = istDate();
  const toUtc = istDayAfterUtc(today);
  const fromUtc = new Date(toUtc.getTime() - days * 86_400_000);
  return { ok: true, range: { fromUtc, toUtc, fromDate: istDate(fromUtc), toDate: today } };
}
