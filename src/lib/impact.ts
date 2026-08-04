import "server-only";
import { getSql, neonUrl } from "@/lib/neon";
import { listRoster } from "@/lib/access";
import type { DayRange } from "@/lib/istDate";

// ===========================================================================
// Impact readout — turns cave_activity_log into evidence of use. Answers the
// questions a promotion/renewal case actually needs: how many distinct humans
// used the tool, how many accounts got reviewed, which AMs adopted it (and
// which didn't), how many manual pulls Alfred replaced. All read-only
// aggregation over the log that's already being written — no new plumbing.
// ===========================================================================

export interface ImpactUser {
  label: string;
  email: string;
  role: string | null;
  amName: string | null;
  events: number;
  opens: number;
  accounts: number; // distinct accounts this person opened
  alfred: number;
  lastSeen: string | null;
}

export interface ImpactReadout {
  configured: boolean;
  windowDays: number;
  /** The IST calendar days actually queried, inclusive. The caption prints
   *  these rather than "the last N days": a screenshot of this page has to
   *  carry its own period, or the number gets quoted without one. */
  fromDate: string;
  toDate: string;
  dataFrom: string | null; // earliest event in the WHOLE log (honesty: how much history exists)
  dataTo: string | null;
  totalEventsAllTime: number;
  // window totals
  events: number;
  activeUsers: number;
  accountsReviewed: number; // distinct accounts opened in window
  accountOpens: number;
  exports: number;
  windowChanges: number;
  alfredQuestions: number;
  alfredAskers: number;
  alfredAccounts: number;
  // adoption
  amRosterSize: number;
  amActive: number; // AMs on the roster with >=1 event in window
  amInactive: Array<{ email: string; name: string }>;
  // breakdowns
  users: ImpactUser[];
  eventBreakdown: Array<{ event: string; n: number }>;
  daily: Array<{ d: string; events: number; users: number }>;
}

// The window arrives already resolved to absolute instants (src/lib/istDate.ts
// resolveDayRange). This module never sees a bare calendar date, so there is no
// second place where a timezone could be assumed.

/** Whole IST days spanned, inclusive — what the caption prints. */
function spanDays(r: DayRange): number {
  return Math.max(1, Math.round((r.toUtc.getTime() - r.fromUtc.getTime()) / 86_400_000));
}

const EMPTY = (days: number, fromDate: string, toDate: string): ImpactReadout => ({
  configured: false, windowDays: days, fromDate, toDate, dataFrom: null, dataTo: null, totalEventsAllTime: 0,
  events: 0, activeUsers: 0, accountsReviewed: 0, accountOpens: 0, exports: 0, windowChanges: 0,
  alfredQuestions: 0, alfredAskers: 0, alfredAccounts: 0,
  amRosterSize: 0, amActive: 0, amInactive: [], users: [], eventBreakdown: [], daily: [],
});

const s = (v: unknown): string | null => (v == null ? null : String(v));
const n = (v: unknown): number => Math.round(Number(v) || 0);

export async function getImpact(range: DayRange): Promise<ImpactReadout> {
  const d = spanDays(range);
  if (!neonUrl()) return EMPTY(d, range.fromDate, range.toDate);
  const sql = getSql();

  // One predicate, six queries. Passed as ISO instants with an explicit cast so
  // the comparison never depends on the session timezone of whichever Neon
  // connection serves it. Half-open at the top: `< toUtc`, where toUtc is
  // midnight IST on the day AFTER the selected end date, so a single-day range
  // returns that whole day and consecutive ranges never double-count.
  const from = range.fromUtc.toISOString();
  const to = range.toUtc.toISOString();

  try {
    const [span, totals, alfred, users, events, daily] = await Promise.all([
      sql`SELECT min(ts) first_ts, max(ts) last_ts, count(*)::int all_events FROM cave_activity_log`,
      sql`SELECT
            count(*)::int events,
            count(DISTINCT email)::int users,
            count(DISTINCT entity_id) FILTER (WHERE event='account_opened')::int accounts_reviewed,
            count(*) FILTER (WHERE event='account_opened')::int account_opens,
            count(*) FILTER (WHERE event='csv_exported')::int exports,
            count(*) FILTER (WHERE event='window_changed')::int window_changes
          FROM cave_activity_log WHERE ts >= ${from}::timestamptz AND ts < ${to}::timestamptz`,
      sql`SELECT
            count(*) FILTER (WHERE event='alfred_asked')::int questions,
            count(DISTINCT email) FILTER (WHERE event='alfred_asked')::int askers,
            count(DISTINCT (detail->>'account')) FILTER (WHERE event='alfred_asked' AND detail->>'account' IS NOT NULL)::int accounts
          FROM cave_activity_log WHERE ts >= ${from}::timestamptz AND ts < ${to}::timestamptz`,
      sql`SELECT COALESCE(max(name), email) label, email, max(role) role, max(am_name) am_name,
            count(*)::int events,
            count(*) FILTER (WHERE event='account_opened')::int opens,
            count(DISTINCT entity_id) FILTER (WHERE event='account_opened')::int accounts,
            count(*) FILTER (WHERE event='alfred_asked')::int alfred,
            max(ts) last_seen
          FROM cave_activity_log WHERE ts >= ${from}::timestamptz AND ts < ${to}::timestamptz
          GROUP BY email ORDER BY events DESC LIMIT 200`,
      sql`SELECT event, count(*)::int n FROM cave_activity_log
          WHERE ts >= ${from}::timestamptz AND ts < ${to}::timestamptz GROUP BY 1 ORDER BY n DESC`,
      // Bucket in IST, not UTC. date_trunc on a timestamptz truncates in the
      // connection's timezone — UTC on Vercel — so a 21:00 IST event landed in
      // the PREVIOUS day's bar. Invisible while the window was a rolling
      // "last N days"; obvious the moment someone picks a single day and the
      // count disagrees with the total above it.
      sql`SELECT to_char(date_trunc('day', ts AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD') d, count(*)::int events, count(DISTINCT email)::int users
          FROM cave_activity_log WHERE ts >= ${from}::timestamptz AND ts < ${to}::timestamptz GROUP BY 1 ORDER BY 1`,
    ]);

    const userRows: ImpactUser[] = (users as Record<string, unknown>[]).map((r) => ({
      label: s(r.label) || "unknown",
      email: s(r.email) || "",
      role: s(r.role),
      amName: s(r.am_name),
      events: n(r.events),
      opens: n(r.opens),
      accounts: n(r.accounts),
      alfred: n(r.alfred),
      lastSeen: s(r.last_seen),
    }));

    // AM adoption vs the roster — who *could* use it but didn't.
    const roster = listRoster();
    const activeEmails = new Set(userRows.filter((u) => u.events > 0).map((u) => u.email.toLowerCase()));
    const amActive = roster.ams.filter((a) => activeEmails.has(a.email.toLowerCase()));
    const amInactive = roster.ams.filter((a) => !activeEmails.has(a.email.toLowerCase()));

    const t = (totals as Record<string, unknown>[])[0] || {};
    const a = (alfred as Record<string, unknown>[])[0] || {};
    const sp = (span as Record<string, unknown>[])[0] || {};

    return {
      configured: true,
      windowDays: d,
      fromDate: range.fromDate,
      toDate: range.toDate,
      dataFrom: s(sp.first_ts),
      dataTo: s(sp.last_ts),
      totalEventsAllTime: n(sp.all_events),
      events: n(t.events),
      activeUsers: n(t.users),
      accountsReviewed: n(t.accounts_reviewed),
      accountOpens: n(t.account_opens),
      exports: n(t.exports),
      windowChanges: n(t.window_changes),
      alfredQuestions: n(a.questions),
      alfredAskers: n(a.askers),
      alfredAccounts: n(a.accounts),
      amRosterSize: roster.ams.length,
      amActive: amActive.length,
      amInactive,
      users: userRows,
      eventBreakdown: (events as Record<string, unknown>[]).map((r) => ({ event: s(r.event) || "?", n: n(r.n) })),
      daily: (daily as Record<string, unknown>[]).map((r) => ({ d: s(r.d) || "", events: n(r.events), users: n(r.users) })),
    };
  } catch {
    // Table may not exist yet (nothing logged). Return an empty (but configured) readout.
    return { ...EMPTY(d, range.fromDate, range.toDate), configured: true };
  }
}
