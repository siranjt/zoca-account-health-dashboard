"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Row = {
  entityId: string;
  name: string | null;
  amName: string | null;
  location: string | null;
  mrr: number | null;
  healthTier: string | null;
  lastLead: string | null;
  neverHadLead: boolean;
  leadsMasked: boolean;
  droughtDays: number;
};

const THRESHOLDS = [3, 7, 14, 30];
// Exclusive bands: each threshold covers [t, nextThreshold) — the last is open-ended.
const upperOf = (t: number) => {
  const i = THRESHOLDS.indexOf(t);
  return i >= 0 && i < THRESHOLDS.length - 1 ? THRESHOLDS[i + 1] : Infinity;
};
const bandLabel = (t: number) => {
  const u = upperOf(t);
  return u === Infinity ? `${t}+ days` : `${t}–${u - 1} days`;
};

function ddmmyy(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`;
}

function tierBadge(tier: string | null) {
  const t = (tier || "").toUpperCase();
  const color = t.includes("CRITICAL") ? "#dc2626" : t.includes("RISK") ? "#d97706" : t.includes("MONITOR") ? "#ca8a04" : t.includes("HEALTHY") ? "#16a34a" : "#94a3b8";
  const label = t.split(" ")[0] || "—";
  return <span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ color, background: `${color}1a` }}>{label || "—"}</span>;
}

const TIER_ORDER = ["Critical", "At-risk", "Monitor", "Healthy", "Other"];
function tierGroup(tier: string | null): string {
  const t = (tier || "").toUpperCase();
  if (t.includes("CRITICAL")) return "Critical";
  if (t.includes("RISK")) return "At-risk";
  if (t.includes("MONITOR")) return "Monitor";
  if (t.includes("HEALTHY")) return "Healthy";
  return "Other";
}

export default function LeadDroughtViewer({ isAdmin = false }: { isAdmin?: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(3);
  const [am, setAm] = useState("");
  const [health, setHealth] = useState("");
  const [q, setQ] = useState("");
  const [maskedOnly, setMaskedOnly] = useState(false);
  const [sortKey, setSortKey] = useState<keyof Row>("droughtDays");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  function clearAll() { setAm(""); setHealth(""); setQ(""); setMaskedOnly(false); }
  function toggleSort(k: keyof Row) {
    if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setSortDir(k === "name" || k === "amName" || k === "location" ? 1 : -1); }
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || "").toUpperCase();
      if (e.key === "/" && tag !== "INPUT" && tag !== "SELECT" && tag !== "TEXTAREA") { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  async function testToMe() {
    if (sending) return;
    const to = prompt("Send a sample drought digest to which Slack email? (your Slack address)");
    if (!to) return;
    setSending(true);
    setSendMsg("Sending test…");
    try {
      const d = await fetch(`/api/admin/send-drought-digest?test=1&to=${encodeURIComponent(to.trim())}`, { method: "POST" }).then((r) => r.json());
      if (d.ok) setSendMsg(`✓ Test DM sent to ${d.sentTo} (sample of ${d.sampleOf}'s ${d.accounts} accounts)`);
      else setSendMsg(`Test failed: ${d.reason || d.lookupError || d.error || "unknown"}`);
    } catch { setSendMsg("Test failed."); }
    finally { setSending(false); }
  }

  async function sendAlerts() {
    if (sending) return;
    const prev = await fetch("/api/admin/send-drought-digest?dry=1").then((r) => r.json()).catch(() => null);
    const n = prev?.candidates ?? 0;
    const total = prev?.totalAccounts ?? 0;
    if (!n) { setSendMsg("No AM has an account dry ≥3 days — nothing to send."); return; }
    if (!confirm(`Send lead-drought alerts to ${n} account manager${n === 1 ? "" : "s"} (covering ${total} quiet accounts) via Slack DM? This messages real AMs.`)) return;
    setSending(true);
    setSendMsg("Sending…");
    try {
      const d = await fetch("/api/admin/send-drought-digest", { method: "POST" }).then((r) => r.json());
      if (d.ok) setSendMsg(`✓ Sent — ${d.dmSent ?? 0} DM${d.dmSent === 1 ? "" : "s"} of ${d.candidates ?? 0}${d.channelPosted ? " · channel roll-up posted" : ""}`);
      else setSendMsg(d.configured === false ? "Slack not configured (SLACK_BOT_TOKEN missing)." : "Send failed.");
    } catch { setSendMsg("Send failed."); }
    finally { setSending(false); }
  }

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/lead-droughts", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) { setRows(d?.rows ?? []); setLoading(false); } })
      .catch(() => { if (alive) { setRows([]); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const amOptions = useMemo(
    () => Array.from(new Set((rows ?? []).map((r) => r.amName).filter((v): v is string => !!v))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const healthOptions = useMemo(() => {
    const present = new Set((rows ?? []).map((r) => tierGroup(r.healthTier)));
    return TIER_ORDER.filter((g) => present.has(g));
  }, [rows]);

  // AM + health filters apply before the day-band split, so the band counts and
  // the table both reflect the current AM/health selection.
  const base = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows ?? []).filter((r) =>
      (am === "" || r.amName === am) &&
      (health === "" || tierGroup(r.healthTier) === health) &&
      (!maskedOnly || r.leadsMasked) &&
      (term === "" || [r.name, r.amName, r.location].some((v) => (v || "").toLowerCase().includes(term))));
  }, [rows, am, health, maskedOnly, q]);

  const counts = useMemo(() => {
    const m: Record<number, number> = {};
    for (const t of THRESHOLDS) { const u = upperOf(t); m[t] = base.filter((r) => r.droughtDays >= t && r.droughtDays < u).length; }
    return m;
  }, [base]);

  const view = useMemo(() => {
    const u = upperOf(days);
    const arr = base.filter((r) => r.droughtDays >= days && r.droughtDays < u);
    arr.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === "number" || typeof bv === "number") return sortDir * ((Number(av) || 0) - (Number(bv) || 0));
      return sortDir * String(av ?? "").localeCompare(String(bv ?? ""));
    });
    return arr;
  }, [base, days, sortKey, sortDir]);
  const maskedInView = view.filter((r) => r.leadsMasked).length;

  if (loading) return <div className="py-12 text-center text-sm text-slate-400">Loading lead droughts…</div>;

  const th = "px-2 py-2 font-semibold whitespace-nowrap";
  const Sortable = ({ k, label, cls }: { k: keyof Row; label: string; cls?: string }) => (
    <th className={`${th} ${cls || ""} cursor-pointer select-none hover:text-slate-600`} onClick={() => toggleSort(k)} title="Sort">
      {label}{sortKey === k ? (sortDir === 1 ? " ▲" : " ▼") : ""}
    </th>
  );

  return (
    <div>
      {/* send AM alerts — admin only (these DM real AMs via Slack) */}
      {isAdmin && (
        <div className="mb-3 flex items-center gap-3">
          <button
            onClick={sendAlerts}
            disabled={sending}
            className="rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            style={{ borderColor: "#22d3ee", color: "#22d3ee", background: "rgba(34,211,238,.08)" }}
            title="DM each AM their quiet accounts via Slack"
          >
            {sending ? "Sending…" : "📣 Send AM alerts"}
          </button>
          <button
            onClick={testToMe}
            disabled={sending}
            className="rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            style={{ borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}
            title="DM one sample digest to your own Slack (no AM is touched)"
          >
            🧪 Test to me
          </button>
          {sendMsg && <span className="text-xs text-slate-500">{sendMsg}</span>}
        </div>
      )}

      {/* threshold toggle */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.14em] text-slate-400">No leads for</span>
        {THRESHOLDS.map((t) => {
          const active = days === t;
          return (
            <button
              key={t}
              onClick={() => setDays(t)}
              className="rounded-md border px-3 py-1.5 text-sm font-medium tabular-nums transition-colors"
              style={active
                ? { borderColor: "#22d3ee", color: "#22d3ee", background: "rgba(34,211,238,.10)" }
                : { borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}
            >
              {bandLabel(t)} <span className="ml-1 opacity-70">({counts[t] ?? 0})</span>
            </button>
          );
        })}
        <input
          ref={searchRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search account / AM / location  ( / )"
          className="ml-1 w-56 rounded-md border bg-white px-2 py-1.5 text-xs outline-none"
          style={{ borderColor: "var(--cave-line2)" }}
        />
        <select
          value={am}
          onChange={(e) => setAm(e.target.value)}
          title="Filter by account manager"
          className="max-w-[180px] rounded-md border bg-white px-2 py-1.5 text-xs outline-none"
          style={{ borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}
        >
          <option value="">All AMs ({amOptions.length})</option>
          {amOptions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          value={health}
          onChange={(e) => setHealth(e.target.value)}
          title="Filter by health"
          className="rounded-md border bg-white px-2 py-1.5 text-xs outline-none"
          style={{ borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}
        >
          <option value="">All health</option>
          {healthOptions.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={maskedOnly} onChange={(e) => setMaskedOnly(e.target.checked)} /> Masked only</label>
        {(am || health || q || maskedOnly) && (
          <button onClick={clearAll} className="text-[11px] text-slate-400 hover:text-slate-600" title="Clear filters">clear</button>
        )}
        <a
          href={`/api/admin/lead-droughts?format=csv&days=${days}${am ? `&am=${encodeURIComponent(am)}` : ""}${health ? `&health=${encodeURIComponent(health)}` : ""}`}
          className="ml-auto rounded border px-2 py-1.5 text-[11px] font-medium no-underline"
          style={{ borderColor: "var(--cave-line2)", color: "var(--cave-dim)" }}
        >⭳ CSV</a>
      </div>

      <div className="mb-2 text-sm text-slate-400">
        <b className="text-slate-700">{view.length}</b> account{view.length === 1 ? "" : "s"} with no incoming leads for {bandLabel(days)}
        {maskedInView > 0 && <button onClick={() => setMaskedOnly((v) => !v)} className="ml-2 text-amber-600 hover:underline" title="Filter to masked accounts">· {maskedInView} have leads masked (dry by design){maskedOnly ? " ✓" : ""}</button>}
      </div>

      {view.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">No accounts dry {bandLabel(days)}.</div>
      ) : (
        <div className="table-scroll -mx-1 max-h-[70vh] overflow-auto rounded-lg border" style={{ borderColor: "var(--cave-line)" }}>
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-slate-50 text-left uppercase tracking-wide text-slate-400">
              <tr>
                <Sortable k="name" label="Account" />
                <Sortable k="amName" label="Account manager" />
                <Sortable k="location" label="Location" />
                <Sortable k="droughtDays" label="Days dry" cls="text-right" />
                <Sortable k="lastLead" label="Last lead" />
                <Sortable k="mrr" label="MRR" cls="text-right" />
                <Sortable k="healthTier" label="Health" />
                <Sortable k="leadsMasked" label="Lead masking" />
              </tr>
            </thead>
            <tbody>
              {view.map((r) => (
                <tr key={r.entityId} className="border-t border-slate-100">
                  <td className="max-w-[280px] truncate px-2 py-1.5 text-slate-700">
                    <a href={`/account/${r.entityId}`} className="text-slate-700 no-underline hover:text-cyan-600" title="Open account">{r.name || "(unnamed)"}</a>
                  </td>
                  <td className={`px-2 py-1.5 text-slate-600 ${r.amName ? "cursor-pointer hover:text-cyan-600" : ""}`} onClick={() => r.amName && setAm(r.amName)} title={r.amName ? "Filter by this AM" : undefined}>{r.amName || "—"}</td>
                  <td className={`px-2 py-1.5 text-slate-500 ${r.location ? "cursor-pointer hover:text-cyan-600" : ""}`} onClick={() => r.location && setQ(r.location)} title={r.location ? "Search this location" : undefined}>{r.location || "—"}</td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-slate-700">
                    {r.droughtDays}{r.neverHadLead && <span className="ml-1 text-[10px] font-normal text-slate-400">(never)</span>}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-slate-500">{r.neverHadLead ? "never" : ddmmyy(r.lastLead)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{r.mrr != null ? `$${Math.round(r.mrr).toLocaleString()}` : "—"}</td>
                  <td className="px-2 py-1.5 cursor-pointer" onClick={() => setHealth(tierGroup(r.healthTier))} title="Filter by this health">{tierBadge(r.healthTier)}</td>
                  <td className="px-2 py-1.5">
                    {r.leadsMasked
                      ? <span className="rounded px-1.5 py-0.5 text-[10px] font-medium text-amber-700" style={{ background: "rgba(217,119,6,.12)" }}>🔒 masked</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
