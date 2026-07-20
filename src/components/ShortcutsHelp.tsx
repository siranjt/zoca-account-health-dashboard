"use client";

import { useEffect, useState } from "react";

const SHORTCUTS: { keys: string; what: string }[] = [
  { keys: "⌘K / Ctrl-K", what: "Open command palette (search accounts & actions)" },
  { keys: "?", what: "Show this shortcuts help" },
  { keys: "c", what: "Toggle Ask-Alfred chat" },
  { keys: "[  ]", what: "Previous / next tab (account detail)" },
  { keys: "←  →", what: "Previous / next account (account detail)" },
  { keys: "Esc", what: "Close palette / dialog" },
];

export default function ShortcutsHelp() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === "?") { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[2147483550] flex items-center justify-center p-6" style={{ background: "rgba(2,6,8,.65)" }} onClick={() => setOpen(false)}>
      <div className="w-full max-w-[420px] rounded-xl border p-5" style={{ borderColor: "var(--cave-line2)", background: "var(--cave-panel)" }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold" style={{ color: "var(--cave-cy)" }}>⌨ Keyboard shortcuts</div>
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-200">✕</button>
        </div>
        <div className="space-y-2">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex items-center gap-3 text-xs">
              <kbd className="min-w-[92px] rounded px-2 py-1 text-center font-mono" style={{ background: "var(--cave-line)", color: "#a7c3c8" }}>{s.keys}</kbd>
              <span className="text-slate-400">{s.what}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
