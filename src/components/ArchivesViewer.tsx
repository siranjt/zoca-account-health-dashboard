"use client";

import { useMemo, useState } from "react";
import RetoolAllData from "./RetoolAllData";

type Item = { entityId: string; name: string; aka: string | null; am: string | null };

// Admin-only "Archives" — the full per-account data dump (all 76 Retool queries,
// run live). Moved off the detail page: pick one account deliberately so the
// heavy query fan-out only fires when an admin asks for it.
export default function ArchivesViewer({ picker }: { picker: Item[] }) {
  const [sel, setSel] = useState<Item | null>(null);
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const base = t
      ? picker.filter((a) => a.name.toLowerCase().includes(t) || (a.aka || "").toLowerCase().includes(t) || (a.am || "").toLowerCase().includes(t))
      : picker;
    return base.slice(0, 60);
  }, [picker, q]);

  if (sel) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-lg border p-3" style={{ borderColor: "var(--cave-line)" }}>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-100">{sel.name}</div>
            <div className="text-[11px] text-slate-400">{sel.am || "—"} · full data archive · 76 live queries</div>
          </div>
          <button onClick={() => setSel(null)} className="ml-auto flex-none rounded-md border px-3 py-1.5 text-xs text-cyan-300 transition-colors hover:bg-cyan-400/10" style={{ borderColor: "var(--cave-line)" }}>
            ← Change account
          </button>
        </div>
        <RetoolAllData entityId={sel.entityId} />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 rounded-md border px-3 py-2 text-[12px]" style={{ borderColor: "color-mix(in srgb, #f59e0b 40%, transparent)", background: "color-mix(in srgb, #f59e0b 8%, transparent)", color: "#fbbf24" }}>
        Heavy view — selecting an account runs all 76 Retool queries live against the warehouse. Pick one deliberately.
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search account or AM…"
        autoFocus
        className="mb-3 w-full max-w-md rounded-md border bg-transparent px-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-500/50"
        style={{ borderColor: "var(--cave-line)" }}
      />
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((a) => (
          <button
            key={a.entityId}
            onClick={() => setSel(a)}
            className="rounded-md border px-3 py-2 text-left transition-colors hover:border-cyan-500/50 hover:bg-cyan-400/5"
            style={{ borderColor: "var(--cave-line)" }}
          >
            <div className="truncate text-sm text-slate-200">{a.name}</div>
            <div className="truncate text-[11px] text-slate-500">{a.am || "—"}</div>
          </button>
        ))}
      </div>
      {shown.length === 0 && <div className="py-8 text-center text-sm text-slate-500">No accounts match.</div>}
      {!q.trim() && picker.length > 60 && (
        <div className="mt-3 text-[11px] text-slate-500">Showing first 60 of {picker.length} accounts — search to narrow.</div>
      )}
    </div>
  );
}
