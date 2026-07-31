"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import VoidCharts from "./VoidCharts";

function copyToClipboard(v: string | null | undefined, label: string) {
  if (!v) return;
  navigator.clipboard?.writeText(String(v)).then(() => {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("cave-toast", { detail: { message: `Copied ${label}` } }));
  }).catch(() => {});
}

type Ticket = { identifier: string; title: string; url: string; classification: string };
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
const KPI_STYLE: Record<Kpi, { value: string; pill: string; pillBg: string }> = {
  outstanding: { value: "var(--cave-txt, #0f172a)", pill: "#0ea5e9", pillBg: "rgba(14,165,233,.14)" },
  invoices: { value: "#ef4444", pill: "#ef4444", pillBg: "rgba(239,68,68,.14)" },
  ach: { value: "var(--cave-txt, #0f172a)", pill: "#0ea5e9", pillBg: "rgba(14,165,233,.14)" },
  multi: { value: "#d97706", pill: "#d97706", pillBg: "rgba(217,119,6,.12)" },
  tickets: { value: "#dc2626", pill: "#dc2626", pillBg: "rgba(220,38,38,.1)" },
  annotations: { value: "#16a34a", pill: "#16a34a", pillBg: "rgba(22,163,74,.1)" },
};

const usd = (n: number | null) => (n == null ? "—" : `$${Math.round(n).toLocaleString()}`);
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
  const [subStatus, setSubStatus] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sortKey, setSortKey] = useState<keyof Row>("invDate");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  function clearAll() {
    setQ(""); setAm(""); setStatus(""); setMonth(""); setAch(""); setAuto("");
    setMultiOnly(false); setSubStatus(""); setOverdueOnly(false); setActiveKpi(null);
  }
  function toggleSort(k: keyof Row) {
    if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setSortDir(k === "biz" || k === "amName" ? 1 : -1); }
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || "").toUpperCase();
      if (e.key === "/" && tag !== "INPUT" && tag !== "SELECT" && tag !== "TEXTAREA") { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  async function loadData(bust = false) {
    setRefreshing(true);
    try {
      const [inv, anns] = await Promise.all([
        fetch(`/api/admin/void${bust ? "?refresh=1" : ""}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
        fetch("/api/admin/void/annotations", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      ]);
      setRows(inv?.rows ?? []);
      if (anns?.annotations) setAnn(anns.annotations);
      setFetchedAt(new Date().toLocaleTimeString());
    } catch { setRows((p) => p ?? []); }
    finally { setLoading(false); setRefreshing(false); }
  }
  useEffect(() => { loadData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function saveAnnotation(invoiceId: string, patch: Ann) {
    setAnn((prev) => ({ ...prev, [invoiceId]: { ...(prev[invoiceId] || {}), ...patch } }));
    fetch("/api/admin/void/annotations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceNumber: invoiceId, patch }) }).catch(() => {});
  }

  const XL_HEADERS = ["Customer Id", "Entity Id", "Biz name", "AM", "Sub status", "Cancelling at", "Invoice #", "ACH", "Auto debit", "AM Comment", "Date", "First Name", "Email", "Phone", "Company", "Amount Due", "Caller", "Connection", "Comments", "Old comments", "Tickets"];
  async function exportExcel() {
    const mod: any = await import("xlsx-js-style");
    const XLSX = mod.default ?? mod;
    const rowVals = (r: Row) => {
      const a = ann[r.invoiceId] || {};
      return [r.customerId || "", r.entityId || "", r.biz || "", r.amName || "", r.subStatus || "", r.cancellingAt || "", r.invoiceId, r.achInFlight ? "In Progress" : "", (r.autoCollection || "").toUpperCase(), a.amComment || "", r.invDate || "", r.firstName || "", r.email || "", r.phone || "", r.company || "", r.amountDue ?? "", a.caller || "", a.connectionStatus || "", a.comments || "", a.oldComments || "", r.ticket ? r.ticket.identifier : ""];
    };
    const wb = XLSX.utils.book_new();
    const hdrStyle = { font: { bold: true, color: { rgb: "FFFFFFFF" }, sz: 11 }, fill: { fgColor: { rgb: "FF1F0843" } }, alignment: { horizontal: "center" } };
    const addSheet = (list: Row[], name: string) => {
      const ws = XLSX.utils.aoa_to_sheet([XL_HEADERS, ...list.map(rowVals)]);
      XL_HEADERS.forEach((_, i) => { const c = XLSX.utils.encode_cell({ r: 0, c: i }); if (ws[c]) ws[c].s = hdrStyle; });
      ws["!cols"] = XL_HEADERS.map((h) => ({ wch: Math.max(10, h.length + 2) }));
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    };
    addSheet(filtered, "Miss-payment");
    for (const m of months) addSheet(all.filter((r) => r.invoiceMonth === m), m);
    addSheet(all.filter((r) => r.multiMonth), "Multi-month");
    XLSX.writeFile(wb, "void-unpaid-invoices.xlsx");
  }

  const all = rows ?? [];
  // Month tabs/filter show only the 3 most-recent months (the actively-collected
  // book — currently Jul/Jun/May; auto-rolls forward). Older unpaid invoices are
  // not dropped — they still appear under the "All" tab.
  const months = useMemo(() => Array.from(new Set(all.map((r) => r.invoiceMonth).filter(Boolean) as string[]))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime()), [all]);
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
      (subStatus === "" || r.subStatus === subStatus) &&
      (!overdueOnly || (r.daysOverdue ?? 0) > 0) &&
      (!multiOnly || r.multiMonth));
  }, [tabFiltered, q, am, status, month, ach, auto, subStatus, overdueOnly, multiOnly]);

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

  const shown = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === "number" || typeof bv === "number") return sortDir * ((Number(av) || 0) - (Number(bv) || 0));
      return sortDir * String(av ?? "").localeCompare(String(bv ?? ""));
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const anyFilter = !!(q || am || status || month || ach || auto || subStatus || overdueOnly || multiOnly || activeKpi);

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
  const Sortable = ({ k, label, cls }: { k: keyof Row; label: string; cls?: string }) => (
    <th className={`${th} ${cls || ""} cursor-pointer select-none hover:text-slate-600`} onClick={() => toggleSort(k)} title="Sort">
      {label}{sortKey === k ? (sortDir === 1 ? " ▲" : " ▼") : ""}
    </th>
  );
  const clickCell = "cursor-pointer hover:text-cyan-600";

  return (
    <div>
      {/* filters row — top, single line */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search business, AM, customer ID, invoice…   ( / )" className="min-w-[240px] flex-1 rounded-md border bg-white px-3 py-2 text-xs outline-none" style={{ borderColor: "var(--cave-line2)" }} />
        <select value={am} onChange={(e) => setAm(e.target.value)} className="max-w-[150px] rounded-md border bg-white px-2 py-2 text-xs" style={{ borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}><option value="">All AMs</option>{amOptions.map((a) => <option key={a} value={a}>{a}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border bg-white px-2 py-2 text-xs" style={{ borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}><option value="">All statuses</option><option value="payment_due">payment due</option><option value="not_paid">not paid</option></select>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-md border bg-white px-2 py-2 text-xs" style={{ borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}><option value="">All months</option>{months.map((m) => <option key={m} value={m}>{m}</option>)}</select>
        <select value={ach} onChange={(e) => setAch(e.target.value)} className="rounded-md border bg-white px-2 py-2 text-xs" style={{ borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}><option value="">ACH any</option><option value="yes">In flight</option><option value="no">None</option></select>
        <select value={auto} onChange={(e) => setAuto(e.target.value)} className="rounded-md border bg-white px-2 py-2 text-xs" style={{ borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}><option value="">Auto debit any</option><option value="on">On</option><option value="off">Off</option></select>
        <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={multiOnly} onChange={(e) => setMultiOnly(e.target.checked)} /> Multi-month only</label>
      </div>

      {/* showing + refresh line */}
      <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px]">
        <span className="uppercase tracking-wide text-slate-400">Showing <b className="text-slate-600">{filtered.length}</b> / {tabFiltered.length}{fetchedAt ? <> · last refresh <b className="text-slate-600">{fetchedAt}</b></> : null}</span>
        {anyFilter && <button onClick={clearAll} className="rounded border px-2 py-0.5 text-[11px] text-slate-500 hover:text-slate-700" style={{ borderColor: "var(--cave-line2)" }}>clear filters ✕</button>}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={exportExcel} className="rounded border px-3 py-1.5 font-medium" style={{ borderColor: "#22d3ee", color: "#22d3ee" }}>⭳ Export Excel</button>
          <button onClick={() => loadData(true)} disabled={refreshing} className="rounded px-3 py-1.5 font-medium text-white disabled:opacity-60" style={{ background: "#0891b2" }}>{refreshing ? "Refreshing…" : "↻ Refresh live data"}</button>
        </div>
      </div>

      {/* tabs */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {["All", ...months].map((t) => {
          const active = tab === t;
          return (
            <button key={t} onClick={() => setTab(t)}
              className="rounded-full border px-3 py-1 text-xs font-medium"
              style={active ? { borderColor: "#22d3ee", color: "#22d3ee", background: "rgba(34,211,238,.12)" } : { borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}>
              {t === "All" ? "All" : t.split(" ")[0]} <span className="ml-1 opacity-70">({tabCounts[t] ?? 0})</span>
            </button>
          );
        })}
      </div>

      {/* KPI cards — click to filter */}
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {KPIS.map((k) => {
          const on = activeKpi === k.key;
          const st = KPI_STYLE[k.key];
          return (
            <button key={k.key} onClick={() => setActiveKpi(on ? null : k.key)}
              className="rounded-xl border p-3 text-left transition-colors"
              style={{ borderColor: on ? st.pill : "var(--cave-line)", background: on ? st.pillBg : "var(--cave-panel)" }}>
              <div className="flex items-start justify-between gap-1">
                <div className="text-[10px] uppercase tracking-[0.1em] text-slate-400">{k.label}</div>
                <span className="shrink-0 rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide" style={{ color: st.pill, background: st.pillBg }}>{on ? "✓ filtering" : "click to filter"}</span>
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: st.value }}>{k.value}</div>
              <div className="mt-0.5 text-[10px] text-slate-400">{k.sub}</div>
            </button>
          );
        })}
      </div>

      <div className="mb-4"><VoidCharts rows={userFiltered} onDrill={(kind, value) => {
        if (kind === "am") setAm(value);
        else if (kind === "month") setMonth(value);
        else if (kind === "subStatus") setSubStatus(value);
        else if (kind === "overdue") setOverdueOnly(true);
        else if (kind === "manual") { setAuto("off"); setOverdueOnly(true); }
        else if (kind === "stuck") { setAuto("off"); setOverdueOnly(true); setAch("no"); }
      }} /></div>

      <div className="table-scroll -mx-1 max-h-[72vh] overflow-auto rounded-lg border" style={{ borderColor: "var(--cave-line)" }}>
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 bg-slate-50 text-left uppercase tracking-wide text-slate-400">
            <tr>
              <th className={th}>Customer Id</th><th className={th}>Entity Id</th>
              <Sortable k="biz" label="Biz name" /><Sortable k="amName" label="AM" />
              <Sortable k="subStatus" label="Sub status" /><Sortable k="cancellingAt" label="Cancelling at" />
              <Sortable k="invoiceId" label="Invoice #" /><th className={th}>ACH</th>
              <Sortable k="autoCollection" label="Auto debit" /><th className={th}>AM Comment</th>
              <Sortable k="invDate" label="Date" /><th className={th}>First Name</th>
              <th className={th}>Email</th><th className={th}>Phone</th><th className={th}>Company</th>
              <Sortable k="amountDue" label="Amount Due" cls="text-right" />
              <th className={th}>Caller</th><th className={th}>Connection</th><th className={th}>Comments</th><th className={th}>Old comments</th><th className={th}>Tickets</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const a = ann[r.invoiceId] || {};
              return (
                <tr key={r.invoiceId} className="border-t border-slate-100" style={r.multiMonth ? { background: "rgba(217,119,6,.05)" } : undefined}>
                  <td className={`${td} tabular-nums text-slate-400`}>{r.customerId || "—"}</td>
                  <td className={`${td} tabular-nums text-slate-400`} title={r.entityId || ""}>{r.entityId ? r.entityId.slice(0, 8) : "—"}</td>
                  <td className={`${td} max-w-[220px] truncate text-slate-700`}>{r.entityId ? <a href={`/account/${r.entityId}`} className="text-slate-700 no-underline hover:text-cyan-600">{r.biz || "(no name)"}</a> : (r.biz || "(no name)")}{!r.inBook && <span className="ml-1 text-[8px] uppercase text-slate-400">off-book</span>}</td>
                  <td className={`${td} text-slate-600 ${r.amName ? clickCell : ""}`} onClick={() => r.amName && setAm(r.amName)} title={r.amName ? "Filter by this AM" : undefined}>{r.amName || "—"}</td>
                  <td className={`${td} ${r.subStatus ? "cursor-pointer" : ""}`} onClick={() => r.subStatus && setSubStatus(r.subStatus)} title={r.subStatus ? "Filter by this status" : undefined}><span className="text-[10px] font-medium" style={{ color: r.subStatus === "active" ? "#16a34a" : r.subStatus === "cancelled" ? "#dc2626" : "#b45309" }}>{r.subStatus || "—"}</span></td>
                  <td className={`${td} tabular-nums text-slate-500`}>{fmtDate(r.cancellingAt)}</td>
                  <td className={`${td} tabular-nums text-slate-500 ${clickCell}`} onClick={() => copyToClipboard(r.invoiceId, "invoice #")} title="Copy invoice #">{r.invoiceId}</td>
                  <td className={`${td} cursor-pointer`} onClick={() => setAch(r.achInFlight ? "yes" : "no")} title="Filter by ACH">{r.achInFlight ? <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ color: "#0369a1", background: "rgba(3,105,161,.12)" }}>In Progress</span> : <span className="text-slate-300">—</span>}</td>
                  <td className={`${td} cursor-pointer`} onClick={() => setAuto((r.autoCollection || "").toLowerCase() === "on" ? "on" : "off")} title="Filter by auto-debit"><span className="text-[10px] font-medium" style={{ color: (r.autoCollection || "").toLowerCase() === "on" ? "#16a34a" : "#dc2626" }}>{(r.autoCollection || "—").toUpperCase()}</span></td>
                  <td className={td}><EditableText value={a.amComment || ""} onSave={(v) => saveAnnotation(r.invoiceId, { amComment: v })} /></td>
                  <td className={`${td} tabular-nums text-slate-500`}>{fmtDate(r.invDate)}</td>
                  <td className={`${td} text-slate-600`}>{r.firstName || "—"}</td>
                  <td className={`${td} max-w-[160px] truncate text-slate-500 ${r.email ? clickCell : ""}`} title={r.email ? "Copy email" : ""} onClick={() => copyToClipboard(r.email, "email")}>{r.email || "—"}</td>
                  <td className={`${td} tabular-nums text-slate-500 ${r.phone ? clickCell : ""}`} title={r.phone ? "Copy phone" : undefined} onClick={() => copyToClipboard(r.phone, "phone")}>{r.phone || "—"}</td>
                  <td className={`${td} max-w-[160px] truncate text-slate-500`}>{r.company || "—"}</td>
                  <td className={`${td} text-right font-semibold tabular-nums text-red-600`}>{usd(r.amountDue)}{r.currency && r.currency !== "USD" ? <span className="ml-1 text-[9px] text-slate-400">{r.currency}</span> : null}</td>
                  <td className={td}><EditableSelect value={a.caller || ""} options={["Shakthi", "Joshi"]} onSave={(v) => saveAnnotation(r.invoiceId, { caller: v })} styleFor={callerStyle} /></td>
                  <td className={td}><EditableSelect value={a.connectionStatus || ""} options={["Connected", "VM", "Not connected"]} onSave={(v) => saveAnnotation(r.invoiceId, { connectionStatus: v })} styleFor={connStyle} /></td>
                  <td className={td}><EditableText value={a.comments || ""} onSave={(v) => saveAnnotation(r.invoiceId, { comments: v })} /></td>
                  <td className={td}><EditableText value={a.oldComments || ""} onSave={(v) => saveAnnotation(r.invoiceId, { oldComments: v })} /></td>
                  <td className={td}>{r.ticket ? (
                    <a href={r.ticket.url} target="_blank" rel="noopener noreferrer" className="block no-underline" title={r.ticket.title}>
                      <span className="inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ color: "#dc2626", background: "rgba(220,38,38,.1)" }}>{r.ticket.identifier} ↗</span>
                      {r.ticket.classification && <div className="mt-0.5 max-w-[92px] truncate text-[8px] uppercase tracking-wide text-slate-400" title={r.ticket.classification}>{r.ticket.classification}</div>}
                    </a>
                  ) : <span className="text-slate-300">No tickets</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
