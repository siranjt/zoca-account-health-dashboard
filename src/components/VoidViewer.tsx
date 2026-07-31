"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  invoiceId: string; status: string; amountDue: number | null; total: number | null; currency: string | null;
  invDate: string | null; dueDate: string | null; daysOverdue: number | null;
  customerId: string | null; entityId: string | null; biz: string | null; amName: string | null;
  healthTier: string | null; state: string | null; phone: string | null; email: string | null;
  autoCollection: string | null; achInFlight: boolean; inBook: boolean;
};

const usd = (n: number | null) => (n == null ? "—" : `$${Math.round(n).toLocaleString()}`);
function ddmmyy(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`;
}
function statusPill(s: string) {
  const paymentDue = s === "payment_due";
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={paymentDue ? { color: "#b45309", background: "rgba(217,119,6,.12)" } : { color: "#dc2626", background: "rgba(220,38,38,.12)" }}>
      {s.replace("_", " ")}
    </span>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--cave-line)", background: "var(--cave-panel)" }}>
      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: tone || "var(--cave-txt, #0f172a)" }}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

export default function VoidViewer() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [am, setAm] = useState("");
  const [status, setStatus] = useState("");
  const [auto, setAuto] = useState("");
  const [ach, setAch] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/void", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) { setRows(d?.rows ?? []); setLoading(false); } })
      .catch(() => { if (alive) { setRows([]); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const amOptions = useMemo(
    () => Array.from(new Set((rows ?? []).map((r) => r.amName).filter((v): v is string => !!v))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const view = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows ?? []).filter((r) =>
      (!term || [r.biz, r.amName, r.invoiceId, r.customerId, r.email].some((v) => (v || "").toLowerCase().includes(term))) &&
      (am === "" || r.amName === am) &&
      (status === "" || r.status === status) &&
      (auto === "" || (r.autoCollection || "").toLowerCase() === auto) &&
      (ach === "" || (ach === "yes" ? r.achInFlight : !r.achInFlight)));
  }, [rows, q, am, status, auto, ach]);

  const kpi = useMemo(() => {
    const out = view.reduce((s, r) => s + (r.amountDue ?? 0), 0);
    const achN = view.filter((r) => r.achInFlight).length;
    const offAuto = view.filter((r) => (r.autoCollection || "").toLowerCase() === "off");
    const offAutoSum = offAuto.reduce((s, r) => s + (r.amountDue ?? 0), 0);
    const offBook = view.filter((r) => !r.inBook).length;
    return { out, achN, offAutoN: offAuto.length, offAutoSum, offBook };
  }, [view]);

  if (loading) return <div className="py-12 text-center text-sm text-slate-400">Loading unpaid book…</div>;

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Outstanding" value={usd(kpi.out)} sub={`${view.length} unpaid invoice${view.length === 1 ? "" : "s"}`} tone="#dc2626" />
        <Stat label="Auto-debit OFF" value={usd(kpi.offAutoSum)} sub={`${kpi.offAutoN} manual-chase`} tone="#b45309" />
        <Stat label="ACH in flight" value={kpi.achN} sub="collection in progress" tone="#0369a1" />
        <Stat label="Off-book" value={kpi.offBook} sub="churned / unmapped, still owing" />
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search biz / AM / invoice…"
          className="w-52 rounded-md border bg-white px-2 py-1.5 text-xs outline-none" style={{ borderColor: "var(--cave-line2)" }} />
        <select value={am} onChange={(e) => setAm(e.target.value)} title="Filter by AM"
          className="max-w-[180px] rounded-md border bg-white px-2 py-1.5 text-xs" style={{ borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}>
          <option value="">All AMs ({amOptions.length})</option>
          {amOptions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} title="Filter by status"
          className="rounded-md border bg-white px-2 py-1.5 text-xs" style={{ borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}>
          <option value="">All statuses</option>
          <option value="payment_due">payment due</option>
          <option value="not_paid">not paid</option>
        </select>
        <select value={auto} onChange={(e) => setAuto(e.target.value)} title="Filter by auto-collect"
          className="rounded-md border bg-white px-2 py-1.5 text-xs" style={{ borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}>
          <option value="">Auto-collect: any</option>
          <option value="on">On</option>
          <option value="off">Off</option>
        </select>
        <select value={ach} onChange={(e) => setAch(e.target.value)} title="Filter by ACH"
          className="rounded-md border bg-white px-2 py-1.5 text-xs" style={{ borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}>
          <option value="">ACH: any</option>
          <option value="yes">In flight</option>
          <option value="no">None</option>
        </select>
        {(q || am || status || auto || ach) && (
          <button onClick={() => { setQ(""); setAm(""); setStatus(""); setAuto(""); setAch(""); }} className="text-[11px] text-slate-400 hover:text-slate-600">clear</button>
        )}
        <a href="/api/admin/void?format=csv" className="ml-auto rounded border px-2 py-1.5 text-[11px] font-medium no-underline" style={{ borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}>⭳ CSV</a>
      </div>

      {view.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">No unpaid invoices match.</div>
      ) : (
        <div className="table-scroll -mx-1 max-h-[70vh] overflow-auto rounded-lg border" style={{ borderColor: "var(--cave-line)" }}>
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-slate-50 text-left uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-2 py-2 font-semibold">Business</th>
                <th className="px-2 py-2 font-semibold">AM</th>
                <th className="px-2 py-2 font-semibold">Invoice</th>
                <th className="px-2 py-2 font-semibold">Status</th>
                <th className="px-2 py-2 text-right font-semibold">Amount due</th>
                <th className="px-2 py-2 text-right font-semibold">Overdue</th>
                <th className="px-2 py-2 font-semibold">Date</th>
                <th className="px-2 py-2 font-semibold">Auto</th>
                <th className="px-2 py-2 font-semibold">ACH</th>
                <th className="px-2 py-2 font-semibold">Phone</th>
                <th className="px-2 py-2 font-semibold">State</th>
              </tr>
            </thead>
            <tbody>
              {view.map((r) => (
                <tr key={r.invoiceId} className="border-t border-slate-100">
                  <td className="max-w-[260px] truncate px-2 py-1.5 text-slate-700">
                    {r.entityId ? <a href={`/account/${r.entityId}`} className="text-slate-700 no-underline hover:text-cyan-600" title="Open account">{r.biz || "(no name)"}</a> : (r.biz || "(no name)")}
                    {!r.inBook && <span className="ml-1 text-[9px] uppercase text-slate-400">off-book</span>}
                  </td>
                  <td className="px-2 py-1.5 text-slate-600">{r.amName || "—"}</td>
                  <td className="px-2 py-1.5 tabular-nums text-slate-500">{r.invoiceId}</td>
                  <td className="px-2 py-1.5">{statusPill(r.status)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-red-600">{usd(r.amountDue)}{r.currency && r.currency !== "USD" ? <span className="ml-1 text-[9px] text-slate-400">{r.currency}</span> : null}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{r.daysOverdue == null ? "—" : `${r.daysOverdue}d`}</td>
                  <td className="px-2 py-1.5 tabular-nums text-slate-500">{ddmmyy(r.invDate)}</td>
                  <td className="px-2 py-1.5">
                    <span className="text-[10px] font-medium" style={{ color: (r.autoCollection || "").toLowerCase() === "on" ? "#16a34a" : "#dc2626" }}>
                      {(r.autoCollection || "—").toString().toUpperCase()}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">{r.achInFlight ? <span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ color: "#0369a1", background: "rgba(3,105,161,.1)" }}>in flight</span> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-2 py-1.5 tabular-nums text-slate-500">{r.phone || "—"}</td>
                  <td className="px-2 py-1.5 text-slate-500">{r.state || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
