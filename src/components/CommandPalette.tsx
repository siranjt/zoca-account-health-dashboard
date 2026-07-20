"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Item {
  id: string;
  name: string;
  am: string | null;
  city: string | null;
  color: string;
}

// Global ⌘K palette: jump to any account, any page, or ask Alfred — from anywhere.
export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [recent, setRecent] = useState<{ id: string; name: string }[]>([]);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // open/close via ⌘K / Ctrl-K / "/" and a custom event (nav button, other UI)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    function onOpen() { setOpen(true); }
    window.addEventListener("keydown", onKey);
    window.addEventListener("cave-open-palette", onOpen as EventListener);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("cave-open-palette", onOpen as EventListener);
    };
  }, []);

  // lazy-load the account index on first open
  useEffect(() => {
    if (!open) return;
    setQ("");
    setCursor(0);
    setTimeout(() => inputRef.current?.focus(), 20);
    try {
      const raw = localStorage.getItem("zoca-recent");
      setRecent(raw ? JSON.parse(raw) : []);
    } catch { /* ignore */ }
    if (items) return;
    fetch("/api/accounts?window=30", { cache: "no-store" })
      .then((r) => r.json())
      .then((p) =>
        setItems(
          (p.accounts ?? []).map((a: any) => ({ id: a.entityId, name: a.name, am: a.accountManager, city: a.city, color: a.health?.color }))
        )
      )
      .catch(() => setItems([]));
  }, [open, items]);

  const actions = useMemo(
    () => [
      { kind: "action" as const, label: "Go to Overview", hint: "dashboard", run: () => router.push("/overview") },
      { kind: "action" as const, label: "Go to Landing", hint: "home", run: () => router.push("/") },
      { kind: "action" as const, label: "Ask Alfred…", hint: "AI", run: () => window.dispatchEvent(new CustomEvent("cave-open-alfred")) },
    ],
    [router]
  );

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    const acc = (items ?? []).filter(
      (a) =>
        !term ||
        a.name.toLowerCase().includes(term) ||
        (a.am ?? "").toLowerCase().includes(term) ||
        (a.city ?? "").toLowerCase().includes(term)
    );
    const accRows = acc.slice(0, 40).map((a) => ({
      kind: "account" as const,
      label: a.name,
      hint: [a.city, a.am].filter(Boolean).join(" · "),
      color: a.color,
      run: () => router.push(`/account/${a.id}`),
    }));
    const actRows = actions.filter((a) => !term || a.label.toLowerCase().includes(term));
    return [...accRows, ...actRows];
  }, [q, items, actions, router]);

  useEffect(() => { if (cursor >= results.length) setCursor(0); }, [results.length, cursor]);

  function choose(i: number) {
    const r = results[i];
    if (!r) return;
    setOpen(false);
    r.run();
  }

  if (!open) return null;

  const showRecent = !q.trim() && recent.length > 0;

  return (
    <div className="fixed inset-0 z-[2147483600] flex items-start justify-center px-4 pt-[12vh]" onMouseDown={() => setOpen(false)}>
      <div className="absolute inset-0" style={{ background: "rgba(2,6,8,.6)", backdropFilter: "blur(2px)" }} />
      <div
        className="relative w-full max-w-[560px] overflow-hidden rounded-xl border shadow-2xl"
        style={{ borderColor: "var(--cave-line2)", background: "var(--cave-panel)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setCursor(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(results.length - 1, c + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
            else if (e.key === "Enter") { e.preventDefault(); choose(cursor); }
          }}
          placeholder={items ? "Search accounts, AMs, cities — or an action…" : "Loading index…"}
          className="w-full border-b bg-transparent px-4 py-3 text-sm outline-none"
          style={{ borderColor: "var(--cave-line)", color: "var(--cave-txt)" }}
        />

        <div className="max-h-[52vh] overflow-auto py-1">
          {showRecent && (
            <>
              <div className="px-4 py-1 text-[10px] uppercase tracking-wide text-slate-500">Recent</div>
              {recent.map((r) => (
                <button
                  key={r.id}
                  onMouseDown={() => { setOpen(false); router.push(`/account/${r.id}`); }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-white/5"
                  style={{ color: "var(--cave-txt)" }}
                >
                  <span className="text-slate-500">🕘</span> {r.name}
                </button>
              ))}
              <div className="my-1 border-t" style={{ borderColor: "var(--cave-line)" }} />
            </>
          )}
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-slate-400">{items ? "No matches." : "Loading…"}</div>
          ) : (
            results.map((r, i) => (
              <button
                key={i}
                onMouseEnter={() => setCursor(i)}
                onMouseDown={() => choose(i)}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm"
                style={{ background: i === cursor ? "rgba(53,224,255,.1)" : "transparent", color: "var(--cave-txt)" }}
              >
                {r.kind === "account" ? (
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color === "red" ? "#dc2626" : r.color === "yellow" ? "#d97706" : "#16a34a" }} />
                ) : (
                  <span className="text-cyan-400">⚡</span>
                )}
                <span className="flex-1 truncate">{r.label}</span>
                {r.hint && <span className="shrink-0 text-[11px] text-slate-500">{r.hint}</span>}
              </button>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 border-t px-4 py-1.5 text-[10px] text-slate-500" style={{ borderColor: "var(--cave-line)" }}>
          <span>↑↓ navigate</span><span>↵ open</span><span>esc close</span><span className="ml-auto">⌘K</span>
        </div>
      </div>
    </div>
  );
}
