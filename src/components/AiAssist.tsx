"use client";

import { useEffect, useMemo, useState } from "react";

interface PromptMeta { function: string; type: string; useCase: string; }

export default function AiAssist({ entityId, windowDays }: { entityId: string; windowDays: number }) {
  const [catalog, setCatalog] = useState<PromptMeta[] | null>(null);
  const [fn, setFn] = useState("");
  const [type, setType] = useState("");
  const [useCase, setUseCase] = useState("");
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [running, setRunning] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/prompts", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => alive && setCatalog(j.items ?? []))
      .catch(() => alive && setCatalog([]));
    return () => { alive = false; };
  }, []);

  const functions = useMemo(() => [...new Set((catalog ?? []).map((c) => c.function))].sort(), [catalog]);
  const types = useMemo(() => [...new Set((catalog ?? []).filter((c) => c.function === fn).map((c) => c.type))].sort(), [catalog, fn]);
  const useCases = useMemo(
    () => [...new Set((catalog ?? []).filter((c) => c.function === fn && c.type === type).map((c) => c.useCase))].sort(),
    [catalog, fn, type]
  );

  async function pickUseCase(u: string) {
    setUseCase(u);
    if (!u) return;
    setLoadingPrompt(true);
    try {
      const r = await fetch(`/api/prompts?function=${encodeURIComponent(fn)}&type=${encodeURIComponent(type)}&use_case=${encodeURIComponent(u)}`, { cache: "no-store" });
      const j = await r.json();
      setInstruction(j.prompt || "");
    } catch {
      /* leave instruction as-is */
    } finally {
      setLoadingPrompt(false);
    }
  }

  async function run() {
    if (!instruction.trim() || running) return;
    setRunning(true);
    setResponse(null);
    setError(null);
    try {
      const r = await fetch(`/api/account/${entityId}/assist`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction, window: windowDays }),
      });
      const j = await r.json();
      if (j.error) setError(j.error);
      else setResponse(j.response || "(empty response)");
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }

  const selectCls = "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs";

  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--cave-line2)", background: "var(--cave-panel)" }}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold" style={{ color: "var(--cave-cy)" }}>✨ AI Assist</span>
        <span className="text-xs text-slate-400">· pick a prompt or write your own · runs over the last {windowDays}d of communication</span>
      </div>

      {/* prompt picker */}
      <div className="mb-2 flex flex-wrap gap-2">
        <select
          className={selectCls}
          value={fn}
          onChange={(e) => { setFn(e.target.value); setType(""); setUseCase(""); }}
          disabled={!catalog}
        >
          <option value="">{catalog ? "Function…" : "loading…"}</option>
          {functions.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select className={selectCls} value={type} onChange={(e) => { setType(e.target.value); setUseCase(""); }} disabled={!fn}>
          <option value="">Type…</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className={selectCls} value={useCase} onChange={(e) => pickUseCase(e.target.value)} disabled={!type}>
          <option value="">Use case…</option>
          {useCases.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        {loadingPrompt && <span className="self-center text-xs text-slate-400">loading prompt…</span>}
      </div>

      {/* instruction (editable / run your own) */}
      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="Select a prompt above, or write your own instruction — e.g. 'Summarise this account's open issues and draft a check-in message.'"
        rows={4}
        className="w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-xs leading-relaxed outline-none focus:border-slate-400"
      />

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={run}
          disabled={running || !instruction.trim()}
          className="rounded-md px-3.5 py-1.5 text-xs font-semibold disabled:opacity-50"
          style={{ color: "#03181e", background: "linear-gradient(180deg, var(--cave-cy), #1899b4)" }}
        >
          {running ? "Running…" : "Run ▸"}
        </button>
        {instruction && (
          <button onClick={() => { setInstruction(""); setResponse(null); setError(null); }} className="text-xs text-slate-400 hover:text-slate-200">
            clear
          </button>
        )}
        <span className="ml-auto text-[10px] text-slate-500">drafts only · never sends</span>
      </div>

      {/* response */}
      {(running || response || error) && (
        <div className="mt-3 rounded-lg border border-slate-100 bg-white p-3">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">LLM Response</span>
            {response && (
              <button
                onClick={() => { navigator.clipboard?.writeText(response); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="ml-auto text-[10px] font-medium text-indigo-600 hover:underline"
              >
                {copied ? "copied ✓" : "copy"}
              </button>
            )}
          </div>
          {running ? (
            <div className="flex items-center gap-2 py-4 text-xs text-slate-400">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-cyan-400" />
              reading the communication history and thinking…
            </div>
          ) : error ? (
            <div className="text-xs text-red-500">{error}</div>
          ) : (
            <div className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-600">{response}</div>
          )}
        </div>
      )}
    </div>
  );
}
