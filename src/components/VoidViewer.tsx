"use client";

import { useEffect, useMemo, useState } from "react";
import VoidCharts from "./VoidCharts";

type Ticket = { identifier: string; title: string; url: string };
type Row = {
  invoiceId: string; status: string; amountDue: number | null; total: number | null; currency: string | null;
  invDate: string | null; invoiceMonth: string | null; dueDate: string | null; daysOverdue: number | null;
  customerId: string | null; entityId: string | null; biz: string | null; amName: string | null; healthTier: string | null;
  state: string | null; firstName: string | null; company: string | null; phone: string | null; email: string | null;
  autoCollection: string | null; subStatus: string | null; cancellingAt: string | null;
  achInFlight: boolean; ticket: Ticket | null; multiMonth: boolean; inBook: boolean;
};
type Ann = { caller?: string; connectionStatus?: string; amComment?: string; comments?: string; oldComments?: string };
type AnnMap = Record<string, Ann>;

const HIGH_VALUE = 500;
type Kpi = "outstanding" | "invoices" | "ach" | "multi" | "tickets" | "annotations";

const usd = (n: number | null) => (n == null ? "—" : `$${Math.round(n).toLocaleString()}`);
function ddmmyy(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`;
}
const annHasNotes = (a?: Ann) => !!a && ["caller", "connectionStatus", "amComment", "comments", "oldComments"].some((k) => (a as any)[k]);

function EditableText({ value, onSave, placeholder }: { value: string; onSave: (v: string) => void; placeholder?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== value) onSave(v); }}
      className="w-full min-w-[110px] rounded border bg-white px-1 py-0.5 text-[11px] outline-none focus:border-slate-400"
      style={{ borderColor: "var(--cave-line2)" }} />
  );
}
function EditableSelect({ value, options, onSave, styleFor }: { value: string; options: string[]; onSave: (v: string) => void; styleFor?: (v: string) => React.CSSProperties }) {
  return (
    <select value={value || ""} onChange={(e) => onSave(e.target.value)}
      className="rounded border px-1 py-0.5 text-[11px] font-medium outline-none"
      style={{ borderColor: "var(--cave-line2)", ...(styleFor ? styleFor(value) : {}) }}>
      <option value="">—</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
const callerStyle = (v: string): React.CSSProperties =>
  v === "Shakthi" ? { color: "#dc2626", background: "rgba(220,38,38,.10)" } : v === "Joshi" ? { color: "#16a34a", background: "rgba(22,163,74,.10)" } : {};
const connStyle = (v: string): React.CSSProperties =>
  v === "Connected" ? { color: "#16a34a", background: "rgba(22,163,74,.10)" } : v === "VM" ? { color: "#0369a1", background: "rgba(3,105,161,.10)" } : v === "Not connected" ? { color: "#dc2626", background: "rgba(220,38,38,.10)" } : {};

export default function VoidViewer() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [ann, setAnn] = useState<AnnMap>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("All");
  const [q, setQ] = useState("");
  const [am, setAm] = useState("");
  const [status, setStatus] = useState("");
  const [month, setMonth] = useState("");
  const [ach, setAch] = useState("");
  const [auto, setAuto] = useState("");
  const [multiOnly, setMultiOnly] = useState(false);
  const [activeKpi, setActiveKpi] = useState<Kpi | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/void", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) { setRows(d?.rows ?? []); setLoading(false); } })
      .catch(() => { if (alive) { setRows([]); setLoading(false); } });
    fetch("/api/admin/void/annotations", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.annotations) setAnn(d.annotations); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  function saveAnnotation(invoiceId: string, patch: Ann) {
    setAnn((prev) => ({ ...prev, [invoiceId]: { ...(prev[invoiceId] || {}), ...patch } }));
    fetch("/api/admin/void/annotations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceNumber: invoiceId, patch }) }).catch(() => {});
  }

  const all = rows ?? [];
  const months = useMemo(() => Array.from(new Set(all.map((r) => r.invoiceMonth).filter(Boolean) as string[]))
    .sort((a, b) => new Date("01 " + b).getTime() - new Date("01 " + a).getTime()), [all]);
  const amOptions = useMemo(() => Array.from(new Set(all.map((r) => r.amName).filter((v): v is string => !!v))).sort((a, b) => a.localeCompare(b)), [all]);

  const tabFiltered = useMemo(() => (tab === "All" ? all : all.filter((r) => r.invoiceMonth === tab)), [all, tab]);
  const tabCounts = useMemo(() => {
    const m: Record<string, number> = { All: all.length };
    for (const r of all) if (r.invoiceMonth) m[r.invoiceMonth] = (m[r.invoiceMonth] || 0) + 1;
    return m;
  }, [all]);

  const repeatSet = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of tabFiltered) if (r.customerId) c.set(r.customerId, (c.get(r.customerId) || 0) + 1);
    return new Set([...c.entries()].filter(([, n]) => n >= 2).map(([k]) => k));
  }, [tabFiltered]);

  // userFiltered = tab + top filters (NO kpi). filtered = userFiltered + kpi.
  const userFiltered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return tabFiltered.filter((r) =>
      (!term || [r.biz, r.amName, r.customerId, r.invoiceId, r.email, r.company].some((v) => (v || "").toLowerCase().includes(term))) &&
      (am === "" || r.amName === am) &&
      (status === "" || r.status === status) &&
      (month === "" || r.invoiceMonth === month) &&
      (ach === "" || (ach === "yes" ? r.achInFlight : !r.achInFlight)) &&
      (auto === "" || (r.autoCollection || "").toLowerCase() === auto) &&
      (!multiOnly || r.multiMonth));
  }, [tabFiltered, q, am, status, month, ach, auto, multiOnly]);

  const kpi = useMemo(() => {
    const out = userFiltered.reduce((s, r) => s + (r.amountDue ?? 0), 0);
    const highVal = userFiltered.filter((r) => (r.amountDue ?? 0) >= HIGH_VALUE).length;
    const repeatN = userFiltered.filter((r) => r.customerId && repeatSet.has(r.customerId)).length;
    const achN = userFiltered.filter((r) => r.achInFlight).length;
    const multiKeys = new Set(userFiltered.filter((r) => r.multiMonth).map((r) => r.entityId || r.customerId));
    const ticketN = userFiltered.filter((r) => r.ticket).length;
    const annN = userFiltered.filter((r) => annHasNotes(ann[r.invoiceId])).length;
    return { out, highVal, repeatN, achN, multiN: multiKeys.size, ticketN, annN };
  }, [userFiltered, repeatSet, ann]);

  const filtered = useMemo(() => {
    if (!activeKpi) return userFiltered;
    switch (activeKpi) {
      case "outstanding": return userFiltered.filter((r) => (r.amountDue ?? 0) >= HIGH_VALUE);
      case "invoices": return userFiltered.filter((r) => r.customerId && repeatSet.has(r.customerId));
      case "ach": return userFiltered.filter((r) => r.achInFlight);
      case "multi": return userFiltered.filter((r) => r.multiMonth);
      case "tickets": return userFiltered.filter((r) => r.ticket);
      case "annotations": return userFiltered.filter((r) => annHasNotes(ann[r.invoiceId]));
    }
  }, [userFiltered, activeKpi, repeatSet, ann]);

  if (loading) return <div className="py-12 text-center text-sm text-slate-400">Loading unpaid book…</div>;

  const KPIS: { key: Kpi; label: string; value: React.ReactNode; sub: string }[] = [
    { key: "outstanding", label: "Outstanding", value: usd(kpi.out), sub: `${kpi.highVal} high-value ≥ $${HIGH_VALUE}` },
    { key: "invoices", label: "Invoices", value: userFiltered.length, sub: `${kpi.repeatN} from repeat businesses` },
    { key: "ach", label: "ACH in flight", value: kpi.achN, sub: "collection in progress" },
    { key: "multi", label: "Multi-month", value: kpi.multiN, sub: "overdue ≥ 2 cycles" },
    { key: "tickets", label: "Tickets matched", value: kpi.ticketN, sub: "linked Linear issues" },
    { key: "annotations", label: "Annotations", value: kpi.annN, sub: "notes saved by reps" },
  ];

  const th = "px-2 py-2 font-semibold whitespace-nowrap";
  const td = "px-2 py-1 align-top";

  return (
    <div>
      {/* tabs */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {["All", ...months].map((t) => {
          const active = tab === t;
          return (
            <button key={t} onClick={() => setTab(t)}
              className="rounded-md border px-2.5 py-1 text-xs font-medium"
              style={active ? { borderColor: "#22d3ee", color: "#22d3ee", background: "rgba(34,211,238,.10)" } : { borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}>
              {t} <span className="ml-1 opacity-70">({tabCounts[t] ?? 0})</span>
            </button>
          );
        })}
      </div>

      {/* KPI cards — click to filter */}
      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {KPIS.map((k) => {
          const on = activeKpi === k.key;
          return (
            <button key={k.key} onClick={() => setActiveKpi(on ? null : k.key)}
              className="rounded-xl border p-3 text-left transition-colors"
              style={{ borderColor: on ? "#22d3ee" : "var(--cave-line)", background: on ? "rgba(34,211,238,.06)" : "var(--cave-panel)" }}>
              <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400">{k.label}</div>
              <div className="mt-0.5 text-xl font-semibold tabular-nums text-slate-800">{k.value}</div>
              <div className="mt-0.5 text-[10px] text-slate-400">{k.sub}</div>
              <div className="mt-1 text-[9px] uppercase tracking-wide" style={{ color: on ? "#0891b2" : "#94a3b8" }}>{on ? "✓ filtering" : "click to filter"}</div>
            </button>
          );
        })}
      </div>

      {/* filters */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search biz / AM / invoice…" className="w-48 rounded-md border bg-white px-2 py-1.5 text-xs outline-none" style={{ borderColor: "var(--cave-line2)" }} />
        <select value={am} onChange={(e) => setAm(e.target.value)} className="max-w-[170px] rounded-md border bg-white px-2 py-1.5 text-xs" style={{ borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}><option value="">All AMs</option>{amOptions.map((a) => <option key={a} value={a}>{a}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border bg-white px-2 py-1.5 text-xs" style={{ borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}><option value="">All statuses</option><option value="payment_due">payment due</option><option value="not_paid">not paid</option></select>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-md border bg-white px-2 py-1.5 text-xs" style={{ borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}><option value="">All months</option>{months.map((m) => <option key={m} value={m}>{m}</option>)}</select>
        <select value={ach} onChange={(e) => setAch(e.target.value)} className="rounded-md border bg-white px-2 py-1.5 text-xs" style={{ borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}><option value="">ACH: any</option><option value="yes">In flight</option><option value="no">None</option></select>
        <select value={auto} onChange={(e) => setAuto(e.target.value)} className="rounded-md border bg-white px-2 py-1.5 text-xs" style={{ borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}><option value="">Auto-debit: any</option><option value="on">On</option><option value="off">Off</option></select>
        <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={multiOnly} onChange={(e) => setMultiOnly(e.target.checked)} /> Multi-month</label>
        <span className="text-[11px] text-slate-400">Showing {filtered.length} / {tabFiltered.length}</span>
        <a href="/api/admin/void?format=csv" className="ml-auto rounded border px-2 py-1.5 text-[11px] font-medium no-underline" style={{ borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}>⭳ CSV</a>
      </div>

      <VoidCharts rows={userFiltered} />

      <div className="table-scroll -mx-1 max-h-[72vh] overflow-auto rounded-lg border" style={{ borderColor: "var(--cave-line)" }}>
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 bg-slate-50 text-left uppercase tracking-wide text-slate-400">
            <tr>
              <th className={th}>Customer Id</th><th className={th}>Entity Id</th><th className={th}>Biz name</th><th className={th}>AM</th>
              <th className={th}>Sub status</th><th className={th}>Cancelling at</th><th className={th}>Invoice #</th><th className={th}>ACH</th>
              <th className={th}>Auto debit</th><th className={th}>AM Comment</th><th className={th}>Date</th><th className={th}>First Name</th>
              <th className={th}>Email</th><th className={th}>Phone</th><th className={th}>Company</th><th className={`${th} text-right`}>Amount Due</th>
              <th className={th}>Caller</th><th className={th}>Connection</th><th className={th}>Comments</th><th className={th}>Old comments</th><th className={th}>Tickets</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const a = ann[r.invoiceId] || {};
              return (
                <tr key={r.invoiceId} className="border-t border-slate-100" style={r.multiMonth ? { background: "rgba(217,119,6,.05)" } : undefined}>
                  <td className={`${td} tabular-nums text-slate-400`}>{r.customerId || "—"}</td>
                  <td className={`${td} tabular-nums text-slate-400`} title={r.entityId || ""}>{r.entityId ? r.entityId.slice(0, 8) : "—"}</td>
                  <td className={`${td} max-w-[220px] truncate text-slate-700`}>{r.entityId ? <a href={`/account/${r.entityId}`} className="text-slate-700 no-underline hover:text-cyan-600">{r.biz || "(no name)"}</a> : (r.biz || "(no name)")}{!r.inBook && <span className="ml-1 text-[8px] uppercase text-slate-400">off-book</span>}</td>
                  <td className={`${td} text-slate-600`}>{r.amName || "—"}</td>
                  <td className={td}><span className="text-[10px] font-medium" style={{ color: r.subStatus === "active" ? "#16a34a" : r.subStatus === "cancelled" ? "#dc2626" : "#b45309" }}>{r.subStatus || "—"}</span></td>
                  <td className={`${td} tabular-nums text-slate-500`}>{ddmmyy(r.cancellingAt)}</td>
                  <td className={`${td} tabular-nums text-slate-500`}>{r.invoiceId}</td>
                  <td className={td}>{r.achInFlight ? <span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ color: "#0369a1", background: "rgba(3,105,161,.1)" }}>in flight</span> : <span className="text-slate-300">—</span>}</td>
                  <td className={td}><span className="text-[10px] font-medium" style={{ color: (r.autoCollection || "").toLowerCase() === "on" ? "#16a34a" : "#dc2626" }}>{(r.autoCollection || "—").toUpperCase()}</span></td>
                  <td className={td}><EditableText value={a.amComment || ""} onSave={(v) => saveAnnotation(r.invoiceId, { amComment: v })} /></td>
                  <td className={`${td} tabular-nums text-slate-500`}>{ddmmyy(r.invDate)}</td>
                  <td className={`${td} text-slate-600`}>{r.firstName || "—"}</td>
                  <td className={`${td} max-w-[160px] truncate text-slate-500`} title={r.email || ""}>{r.email || "—"}</td>
                  <td className={`${td} tabular-nums text-slate-500`}>{r.phone || "—"}</td>
                  <td className={`${td} max-w-[160px] truncate text-slate-500`}>{r.company || "—"}</td>
                  <td className={`${td} text-right font-semibold tabular-nums text-red-600`}>{usd(r.amountDue)}{r.currency && r.currency !== "USD" ? <span className="ml-1 text-[9px] text-slate-400">{r.currency}</span> : null}</td>
                  <td className={td}><EditableSelect value={a.caller || ""} options={["Shakthi", "Joshi"]} onSave={(v) => saveAnnotation(r.invoiceId, { caller: v })} styleFor={callerStyle} /></td>
                  <td className={td}><EditableSelect value={a.connectionStatus || ""} options={["Connected", "VM", "Not connected"]} onSave={(v) => saveAnnotation(r.invoiceId, { connectionStatus: v })} styleFor={connStyle} /></td>
                  <td className={td}><EditableText value={a.comments || ""} onSave={(v) => saveAnnotation(r.invoiceId, { comments: v })} /></td>
                  <td className={td}><EditableText value={a.oldComments || ""} onSave={(v) => saveAnnotation(r.invoiceId, { oldComments: v })} /></td>
                  <td className={td}>{r.ticket ? <a href={r.ticket.url} target="_blank" rel="noopener noreferrer" className="no-underline" title={r.ticket.title}><span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ color: "#7c3aed", background: "rgba(124,58,237,.1)" }}>{r.ticket.identifier}</span></a> : <span className="text-slate-300">No tickets</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
