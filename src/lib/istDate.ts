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
