"use client";

import { useEffect, useMemo, useState } from "react";
import { DateRangeFilter, defaultRange, rangeParams, type RangeState } from "@/components/DateRangeFilter";

type User = {
  label: string; email: string; role: string | null; amName: string | null;
  events: number; opens: number; accounts: number; alfred: number; lastSeen: string | null;
};
type Readout = {
  configured: boolean; windowDays: number;
  fromDate: string; toDate: string;
  dataFrom: string | null; dataTo: string | null; totalEventsAllTime: number;
  events: number; activeUsers: number; accountsReviewed: number; accountOpens: number;
  exports: number; windowChanges: number;
  alfredQuestions: number; alfredAskers: number; alfredAccounts: number;
  amRosterSize: number; amActive: number; amInactive: Array<{ email: string; name: string }>;
  users: User[]; eventBreakdown: Array<{ event: string; n: number }>;
  daily: Array<{ d: string; events: number; users: number }>;
};

const WINDOWS = [7, 30, 90];

function ddmmyy(iso: string | null): string {
  if (!iso) return "—";
  // A bare YYYY-MM-DD is already an IST calendar day — format it as text.
  // `new Date("2026-08-04")` parses as UTC midnight and getDate() reads it back
  // in the VIEWER's timezone, so anyone west of UTC would see 03/08.
  const plain = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (plain) return `${plain[3]}/${plain[2]}/${plain[1].slice(-2)}`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`;
}
function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const ta = new Date(a).getTime(), tb = new Date(b).getTime();
  if (isNaN(ta) || isNaN(tb)) return null;
  return Math.max(1, Math.round((tb - ta) / 86_400_000));
}

// `note` says what the number COUNTS, in one line, always visible — not a
// tooltip. This page gets screenshotted and forwarded to people who will never
// hover anything, and a figure whose definition is hidden is a figure that gets
// quoted wrong.
function Card({ label, value, sub, note }: { label: string; value: React.ReactNode; sub?: string; note?: string }) {
  return (
    <div className="flex flex-col rounded-xl border p-3" style={{ borderColor: "var(--cave-line)", background: "var(--cave-panel)" }}>
      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-800">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
      {note && <div className="mt-2 border-t pt-1.5 text-[10px] leading-snug text-slate-400" style={{ borderColor: "var(--cave-line)" }}>{note}</div>}
    </div>
  );
}

export default function ImpactViewer() {
  const [range, setRange] = useState<RangeState>(() => defaultRange(30));
  const qs = useMemo(() => new URLSearchParams(rangeParams(range)).toString(), [range]);
  const [data, setData] = useState<Readout | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);

  async function sendDigest() {
    if (sending) return;
    if (!confirm("Send the weekly digest to all AMs right now? This DMs every account manager with an at-risk book (and posts the manager roll-up if a channel is set).")) return;
    setSending(true);
    setSendMsg("Sending…");
    try {
      const r = await fetch("/api/admin/send-digest", { method: "POST" });
      const d = await r.json();
      if (d.ok) setSendMsg(`✓ Sent — ${d.dmSent ?? 0} DM${d.dmSent === 1 ? "" : "s"} of ${d.candidates ?? 0}${d.channelPosted ? " · channel roll-up posted" : d.transports?.slackChannel ? " · channel post FAILED (bot in channel?)" : ""}`);
      else setSendMsg(`✗ ${d.error || "send failed"}`);
    } catch (e) {
      setSendMsg(`✗ ${String(e)}`);
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/impact?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [qs]);

  const coverage = useMemo(() => daysBetween(data?.dataFrom ?? null, data?.dataTo ?? null), [data]);
  const maxDaily = useMemo(() => Math.max(1, ...(data?.daily ?? []).map((x) => x.events)), [data]);

  return (
    <div className="space-y-4">
      {/* window + export */}
      <div className="flex flex-wrap items-center gap-2">
        <DateRangeFilter presets={WINDOWS} value={range} onChange={setRange} />
        <a href={`/api/admin/impact?${qs}&format=csv`}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">
          ⭳ Export CSV
        </a>
        <button
          onClick={sendDigest}
          disabled={sending}
          title="Send the weekly AM digest to all AMs now (same as the Monday cron)"
          className="ml-auto rounded-md border px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
          style={{ borderColor: "#0f172a", background: "#0f172a", color: "#fff" }}
        >
          {sending ? "Sending…" : "📨 Send digest now"}
        </button>
        {sendMsg && <span className="text-xs" style={{ color: sendMsg.startsWith("✓") ? "#16a34a" : sendMsg.startsWith("✗") ? "#dc2626" : "#64748b" }}>{sendMsg}</span>}
        {loading && <span className="text-xs text-slate-400">loading…</span>}
      </div>

      {/* honesty banner: how much history actually exists */}
      {data && (
        <div className="rounded-lg border px-3 py-2 text-[11px] text-slate-500" style={{ borderColor: "var(--cave-line2)", background: "rgba(148,163,184,.06)" }}>
          {data.dataFrom
            ? <>Activity log spans <b>{ddmmyy(data.dataFrom)} → {ddmmyy(data.dataTo)}</b>{coverage != null && <> (~{coverage} day{coverage === 1 ? "" : "s"} of history)</>} · <b>{data.totalEventsAllTime.toLocaleString()}</b> total events recorded. Figures below cover <b>{ddmmyy(data.fromDate)} → {ddmmyy(data.toDate)}</b> ({data.windowDays} day{data.windowDays === 1 ? "" : "s"}).</>
            : data.configured ? <>No activity has been recorded yet — the log is configured but empty.</> : <>Activity store not configured (<code>DATABASE_URL</code> missing).</>}
        </div>
      )}

      {/* The carryable sentence. This page is read by people who never saw a
          demo, so the headline has to be prose, not a grid of labels — "Total
          events: 4,182" is not something anyone can repeat in a meeting.
          Derived entirely from the figures below; it never computes anything of
          its own, so it cannot disagree with the cards. */}
      {data?.configured && (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--cave-line2)", background: "var(--cave-panel)" }}>
          <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-cyan-400/70">In this period</div>
          {data.events === 0 ? (
            <p className="text-sm text-slate-400">
              No activity was recorded between <b>{ddmmyy(data.fromDate)}</b> and <b>{ddmmyy(data.toDate)}</b>. That is a
              genuine absence of use in this window, not a loading state — widen the range to see earlier activity.
            </p>
          ) : (
            <p className="text-sm leading-relaxed text-slate-600">
              Between <b>{ddmmyy(data.fromDate)}</b> and <b>{ddmmyy(data.toDate)}</b>,{" "}
              <b className="text-slate-800">{data.activeUsers.toLocaleString()}</b> {data.activeUsers === 1 ? "person" : "people"} opened{" "}
              <b className="text-slate-800">{data.accountsReviewed.toLocaleString()}</b> distinct{" "}
              {data.accountsReviewed === 1 ? "account" : "accounts"} across{" "}
              <b className="text-slate-800">{data.accountOpens.toLocaleString()}</b> account{" "}
              {data.accountOpens === 1 ? "view" : "views"}
              {data.alfredQuestions > 0 && <>, asked the AI analyst <b className="text-slate-800">{data.alfredQuestions.toLocaleString()}</b> {data.alfredQuestions === 1 ? "question" : "questions"}</>}
              {data.exports > 0 && <> and exported <b className="text-slate-800">{data.exports.toLocaleString()}</b> {data.exports === 1 ? "CSV" : "CSVs"}</>}
              .
              {data.amRosterSize > 0 && (
                <> <b className="text-slate-800">{data.amActive}</b> of <b className="text-slate-800">{data.amRosterSize}</b> account managers used it at least once.</>
              )}
            </p>
          )}
        </div>
      )}

      {data && (
        <>
          {/* summary cards */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Card label="Distinct users" value={data.activeUsers} sub={`in ${data.windowDays}d`}
              note="Individual people who signed in and did something. Counted by email address, so one person on two devices is one user — not sessions, not page views." />
            <Card label="Accounts reviewed" value={data.accountsReviewed} sub={`${data.accountOpens} opens`}
              note={`Distinct accounts opened at least once.${data.accountsReviewed ? ` ${data.accountOpens.toLocaleString()} opens across ${data.accountsReviewed.toLocaleString()} accounts means accounts were revisited, not skimmed once.` : ""}`} />
            <Card label="AM adoption" value={`${data.amActive}/${data.amRosterSize}`} sub={data.amRosterSize ? `${Math.round((data.amActive / data.amRosterSize) * 100)}% of AMs` : "no roster"}
              note="Account managers on the roster with at least one event. The denominator is the roster itself, so this moves when someone joins or leaves — a fall can mean a smaller team, not less use." />
            <Card label="Alfred questions" value={data.alfredQuestions} sub={`${data.alfredAskers} askers · ${data.alfredAccounts} accounts`}
              note="Questions put to the AI analyst. Proves it is used, not merely shipped. Every answer is drafted for a human to send — nothing is sent automatically." />
            <Card label="CSV exports" value={data.exports}
              note="Data pulled out for a deck, a meeting or a spreadsheet. The closest proxy for work that previously meant a manual pull from the old dashboard." />
            <Card label="Total events" value={data.events} sub={`${data.windowChanges} window changes`}
              note="Every logged action. Least meaningful on its own — it is the denominator the figures above are measured against." />
          </div>

          {/* What this page cannot tell you. Naming a metric's limits is what
              makes the rest of it credible — the same reasoning applied to the
              servicing-load index. Without this, a reader assumes the numbers
              claim more than they do. */}
          {data.configured && (
            <div className="rounded-xl border px-3 py-2.5 text-[11px] leading-relaxed text-slate-500" style={{ borderColor: "var(--cave-line)", background: "rgba(148,163,184,.04)" }}>
              <b className="text-slate-400">How to read this.</b>{" "}
              Every figure is counted from the platform&apos;s own activity log — a row is written when someone
              signs in, opens an account, changes a window, exports, or asks the AI analyst. Nothing here is
              estimated or sampled. Days are IST days.{" "}
              <b className="text-slate-400">What it does not show:</b>{" "}
              time saved, decisions changed, or revenue affected. It records that an account was opened, not what
              was done about it. It also cannot yet split usage by team — the roster holds roles, not
              departments — so &ldquo;across CS, Finance and CX&rdquo; is not a claim this page can currently support.
            </div>
          )}

          {/* daily activity mini-bars */}
          {data.daily.length > 0 && (
            <div className="rounded-xl border p-3" style={{ borderColor: "var(--cave-line)", background: "var(--cave-panel)" }}>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Daily activity (events)</div>
              <div className="flex items-end gap-0.5" style={{ height: 60 }}>
                {data.daily.map((x) => (
                  <div key={x.d} title={`${x.d}: ${x.events} events · ${x.users} users`} className="flex-1 rounded-t bg-cyan-400/60 hover:bg-cyan-400"
                    style={{ height: `${Math.max(2, (x.events / maxDaily) * 100)}%` }} />
                ))}
              </div>
            </div>
          )}

          {/* AM non-adopters — the "who didn't" evidence */}
          {data.amInactive.length > 0 && (
            <div className="rounded-xl border p-3" style={{ borderColor: "var(--cave-line)", background: "var(--cave-panel)" }}>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">AMs not yet using it ({data.amInactive.length})</div>
              <div className="flex flex-wrap gap-1.5">
                {data.amInactive.map((a) => (
                  <span key={a.email} className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500" title={a.email}>{a.name}</span>
                ))}
              </div>
            </div>
          )}

          {/* per-user adoption table */}
          <div className="rounded-xl border p-3" style={{ borderColor: "var(--cave-line)", background: "var(--cave-panel)" }}>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Per-person usage ({data.users.length})</div>
            <div className="table-scroll -mx-1 max-h-[520px] overflow-auto">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-50 text-left uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-2 py-1.5 font-semibold">Person</th>
                    <th className="px-2 py-1.5 font-semibold">Role</th>
                    <th className="px-2 py-1.5 font-semibold">AM book</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Events</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Opens</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Accounts</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Alfred</th>
                    <th className="px-2 py-1.5 font-semibold">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.email} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 text-slate-700" title={u.email}>{u.label}</td>
                      <td className="px-2 py-1.5 text-slate-500">{u.role ?? "—"}</td>
                      <td className="px-2 py-1.5 text-slate-500">{u.amName ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{u.events}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{u.opens}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{u.accounts}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{u.alfred}</td>
                      <td className="px-2 py-1.5 text-slate-500">{ddmmyy(u.lastSeen)}</td>
                    </tr>
                  ))}
                  {!data.users.length && (
                    <tr><td colSpan={8} className="px-2 py-6 text-center text-slate-400">No usage in this window.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
