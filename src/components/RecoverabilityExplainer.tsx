"use client";

import { useEffect, useMemo, useState } from "react";

type Factor = { text: string; kind: "plus" | "minus" | "info"; points?: number };
type Axes = { relationship: number; mechanism: number; freshness: number; engagement: number };
type Recovery = { tier: "A" | "B" | "C" | "D"; score: number; action: string; engaged: boolean; axes: Axes; factors: Factor[]; headline: string };
type Eng = { appDays: number; leadViews: number; leads30: number; gbp30: number; reviews30: number } | null;
type Row = {
  invoiceId: string; amountDue: number | null; biz: string | null; amName: string | null;
  entityId: string | null; customerId: string | null; subStatus: string | null; daysOverdue: number | null;
  inBook: boolean; recovery: Recovery; engagement: Eng; ticket: { identifier: string; classification: string; url: string } | null;
};

const AXIS_MAX: Axes = { relationship: 35, mechanism: 15, freshness: 20, engagement: 30 };
const AXES: { key: keyof Axes; label: string }[] = [
  { key: "relationship", label: "Relationship" }, { key: "mechanism", label: "Payment path" },
  { key: "freshness", label: "Freshness" }, { key: "engagement", label: "Engagement" },
];
const TIER: Record<Recovery["tier"], { color: string; name: string; blurb: string }> = {
  A: { color: "#16a34a", name: "Self-healing", blurb: "Live, engaged, fresh — recover" },
  B: { color: "#3a7d5c", name: "Nudge", blurb: "Live, stalled on a fixable reason" },
  C: { color: "#d97706", name: "Contested", blurb: "Active but churning — collect now" },
  D: { color: "#dc2626", name: "Write-off", blurb: "Ended or dormant — don't chase" },
};
const usd = (n: number) => "$" + Math.round(n).toLocaleString();

type Acct = { key: string; biz: string; am: string; entityId: string | null; due: number; nInv: number; rep: Row };

export default function RecoverabilityExplainer() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tier, setTier] = useState<"all" | Recovery["tier"]>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/admin/void")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => setRows(d.rows || []))
      .catch((e) => setErr(String(e?.message || e)));
  }, []);

  const accounts = useMemo<Acct[]>(() => {
    if (!rows) return [];
    const m = new Map<string, Acct>();
    for (const r of rows) {
      const key = r.entityId || r.customerId || r.invoiceId;
      const a = m.get(key);
      if (!a) m.set(key, { key, biz: r.biz || "(no name)", am: r.amName || "(unassigned)", entityId: r.entityId, due: r.amountDue ?? 0, nInv: 1, rep: r });
      else { a.due += r.amountDue ?? 0; a.nInv++; if (r.recovery.score > a.rep.recovery.score) a.rep = r; }
    }
    return [...m.values()];
  }, [rows]);

  const counts = useMemo(() => {
    const c: Record<string, { n: number; due: number }> = { A: { n: 0, due: 0 }, B: { n: 0, due: 0 }, C: { n: 0, due: 0 }, D: { n: 0, due: 0 } };
    for (const a of accounts) { const t = a.rep.recovery.tier; c[t].n++; c[t].due += a.due; }
    return c;
  }, [accounts]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return accounts
      .filter((a) => (tier === "all" || a.rep.recovery.tier === tier) && (!term || a.biz.toLowerCase().includes(term) || a.am.toLowerCase().includes(term)))
      .sort((a, b) => "ABCD".indexOf(a.rep.recovery.tier) - "ABCD".indexOf(b.rep.recovery.tier) || b.due - a.due);
  }, [accounts, tier, q]);

  if (err) return <div className="py-12 text-center text-sm text-red-400">Couldn&apos;t load the book: {err}</div>;
  if (!rows) return <div className="py-12 text-center text-sm text-slate-400">Scoring the book…</div>;

  const recDue = counts.A.due + counts.B.due + counts.C.due;
  const recN = counts.A.n + counts.B.n + counts.C.n;

  return (
    <div className="space-y-5">
      {/* how the score works */}
      <div className="rounded-lg border p-4 text-[12px] text-slate-400" style={{ borderColor: "var(--cave-line)" }}>
        <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-cyan-400/70">How each account is scored</div>
        Every account gets a 0–100 recoverability score from four signals — all pulled live, none estimated.
        <span className="text-slate-300"> Relationship</span> (subscription status minus open churn/cancellation tickets, /35),
        <span className="text-slate-300"> payment path</span> (payment in-flight &gt; card-on-file &gt; invoice terms, /15),
        <span className="text-slate-300"> freshness</span> (days overdue, chronic penalty, /20), and
        <span className="text-slate-300"> engagement</span> (opening the app + working leads in the last 30 days, /30).
        A payment already in flight forces <b style={{ color: TIER.A.color }}>A</b>; a cancelled or offboarding account forces <b style={{ color: TIER.D.color }}>D</b>; an open churn ticket on a live account caps it at <b style={{ color: TIER.C.color }}>C</b>.
      </div>

      {/* tier summary + filter tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setTier("all")} className="rounded-md border px-3 py-1.5 text-[12px] font-medium" style={{ borderColor: "var(--cave-line)", background: tier === "all" ? "rgba(148,163,184,.14)" : "transparent", color: tier === "all" ? "var(--cave-txt,#e2e8f0)" : "#94a3b8" }}>
          All · {accounts.length}
        </button>
        {(["A", "B", "C", "D"] as const).map((t) => (
          <button key={t} onClick={() => setTier(tier === t ? "all" : t)} className="rounded-md border px-3 py-1.5 text-[12px] font-medium" style={{ borderColor: tier === t ? TIER[t].color : "var(--cave-line)", background: tier === t ? `${TIER[t].color}1f` : "transparent", color: TIER[t].color }}>
            <b>{t}</b> · {counts[t].n} · {usd(counts[t].due)}
          </button>
        ))}
        <div className="ml-auto text-[12px] text-slate-400">
          <b style={{ color: TIER.A.color }}>{usd(recDue)}</b> recoverable across <b>{recN}</b> accounts (A–C)
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search business or AM…" className="w-full rounded-md border bg-transparent px-3 py-1.5 text-[12px] text-slate-200 placeholder:text-slate-500 sm:w-56" style={{ borderColor: "var(--cave-line)" }} />
      </div>

      {/* account cards */}
      <div className="grid gap-3 lg:grid-cols-2">
        {shown.map((a) => {
          const rec = a.rep.recovery, c = TIER[rec.tier].color;
          return (
            <div key={a.key} className="rounded-lg border p-4" style={{ borderColor: "var(--cave-line)", background: "rgba(148,163,184,.03)" }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-100">
                    {a.entityId ? <a href={`/account/${a.entityId}`} className="text-slate-100 no-underline hover:text-cyan-400">{a.biz}</a> : a.biz}
                    {!a.rep.inBook && <span className="ml-1 text-[8px] uppercase text-slate-500">off-book</span>}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">{a.am} · {usd(a.due)}{a.nInv > 1 ? ` · ${a.nInv} invoices` : ""}{a.rep.subStatus ? ` · ${a.rep.subStatus}` : ""}</div>
                </div>
                <div className="flex flex-none flex-col items-end">
                  <span className="rounded px-2 py-0.5 text-[11px] font-bold" style={{ color: c, background: `${c}1f` }}>{rec.tier} · {rec.score}</span>
                  <span className="mt-1 text-[9px] uppercase tracking-wide text-slate-500">{TIER[rec.tier].name}</span>
                </div>
              </div>

              <p className="mt-2 text-[12px] leading-snug text-slate-300">{rec.headline}</p>

              {/* axis bars */}
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
                {AXES.map(({ key, label }) => {
                  const v = rec.axes[key], max = AXIS_MAX[key], pct = Math.max(0, Math.min(100, (v / max) * 100));
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <span className="w-[76px] flex-none text-[10px] text-slate-400">{label}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "rgba(148,163,184,.16)" }}>
                        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: c }} />
                      </span>
                      <span className="w-8 flex-none text-right text-[10px] tabular-nums text-slate-500">{v}/{max}</span>
                    </div>
                  );
                })}
              </div>

              {/* factors */}
              <ul className="mt-3 space-y-1">
                {rec.factors.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11.5px] leading-snug">
                    <span className="mt-[1px] flex-none font-bold" style={{ color: f.kind === "plus" ? "#22c55e" : f.kind === "minus" ? "#ef4444" : "#64748b" }}>
                      {f.kind === "plus" ? "▲" : f.kind === "minus" ? "▼" : "•"}
                    </span>
                    <span className="text-slate-300">{f.text}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex items-center justify-between border-t pt-2 text-[11px]" style={{ borderColor: "var(--cave-line)" }}>
                <span className="text-slate-500">Recommended</span>
                <span className="font-medium" style={{ color: c }}>{rec.action}</span>
              </div>
            </div>
          );
        })}
      </div>
      {shown.length === 0 && <div className="py-10 text-center text-sm text-slate-500">No accounts in this tier.</div>}
    </div>
  );
}
