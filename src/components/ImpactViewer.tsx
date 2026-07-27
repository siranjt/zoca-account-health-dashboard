"use client";

import { useEffect, useMemo, useState } from "react";

type User = {
  label: string; email: string; role: string | null; amName: string | null;
  events: number; opens: number; accounts: number; alfred: number; lastSeen: string | null;
};
type Readout = {
  configured: boolean; windowDays: number;
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

function Card({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--cave-line)", background: "var(--cave-panel)" }}>
      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-800">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

export default function ImpactViewer() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Readout | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/impact?days=${days}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [days]);

  const coverage = useMemo(() => daysBetween(data?.dataFrom ?? null, data?.dataTo ?? null), [data]);
  const maxDaily = useMemo(() => Math.max(1, ...(data?.daily ?? []).map((x) => x.events)), [data]);

  return (
    <div className="space-y-4">
      {/* window + export */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
          {WINDOWS.map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-2.5 py-1 text-xs font-medium ${days === d ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}>
              {d}d
            </button>
          ))}
        </div>
        <a href={`/api/admin/impact?days=${days}&format=csv`}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">
          ⭳ Export CSV
        </a>
        {loading && <span className="text-xs text-slate-400">loading…</span>}
      </div>

      {/* honesty banner: how much history actually exists */}
      {data && (
        <div className="rounded-lg border px-3 py-2 text-[11px] text-slate-500" style={{ borderColor: "var(--cave-line2)", background: "rgba(148,163,184,.06)" }}>
          {data.dataFrom
            ? <>Activity log spans <b>{ddmmyy(data.dataFrom)} → {ddmmyy(data.dataTo)}</b>{coverage != null && <> (~{coverage} day{coverage === 1 ? "" : "s"} of history)</>} · <b>{data.totalEventsAllTime.toLocaleString()}</b> total events recorded. Figures below cover the last {data.windowDays} days.</>
            : data.configured ? <>No activity has been recorded yet — the log is configured but empty.</> : <>Activity store not configured (<code>DATABASE_URL</code> missing).</>}
        </div>
      )}

      {data && (
        <>
          {/* summary cards */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Card label="Distinct users" value={data.activeUsers} sub={`in ${data.windowDays}d`} />
            <Card label="Accounts reviewed" value={data.accountsReviewed} sub={`${data.accountOpens} opens`} />
            <Card label="AM adoption" value={`${data.amActive}/${data.amRosterSize}`} sub={data.amRosterSize ? `${Math.round((data.amActive / data.amRosterSize) * 100)}% of AMs` : "no roster"} />
            <Card label="Alfred questions" value={data.alfredQuestions} sub={`${data.alfredAskers} askers · ${data.alfredAccounts} accounts`} />
            <Card label="CSV exports" value={data.exports} />
            <Card label="Total events" value={data.events} sub={`${data.windowChanges} window changes`} />
          </div>

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
