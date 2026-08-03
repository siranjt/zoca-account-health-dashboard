"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface PromptMeta { function: string; type: string; useCase: string; }

// One-click comprehensive read — reads the full comms + ticket history and
// produces a handover-grade account analysis. Kept in code (not the shared
// prompt catalog) so it's versioned with the app.
const ANALYSER_PROMPT = `Produce a complete ACCOUNT ANALYSIS for this account, at the standard of a rigorous customer-success analyst briefing an incoming account manager. Read ALL the communication history and every Linear ticket provided, then write a structured document with these sections:

1. Executive summary — business, primary contact, email, phone, location, website, current tools, selected Zoca product(s), discussed pricing, launch date, previous AM. Facts only; mark anything inferred as "reported".
2. Account health — a compact table: overall, relationship, churn risk, product adoption, lead activity, brand sensitivity, main risk, ticket status (one line each).
3. Business background — history, recent changes, service mix, and the owner's real goal (beyond "more leads").
4. Sales & product history — options and prices presented, what they chose, what is ambiguous.
5. Billing — REQUIRES VERIFICATION. List explicitly what the comms/tickets do NOT confirm (trial dates, setup fee, first payment, next renewal). Never assume billing facts.
6. What the customer specifically requested — extract their stated expectations faithfully, grouped (visibility, priority services, geography, competitor intel, reporting, content ownership, etc.).
7. Delivery vs promises — compare what onboarding/tickets claim was done against what was actually validated; surface every contradiction (e.g. content promised as customer-published vs an automated email that auto-drafted it; name/spelling mismatches; "Done" tickets with blank required fields).
8. Open commitments & unresolved items — split Critical vs Important, each with the concrete next action.
9. Customer profile & communication style — what will work and what to avoid with this person.
10. Recommended first-call agenda (numbered) and a 30-day objective.
11. Final assessment — value, main threat, expansion potential.

Rules: ground every statement strictly in the provided communication and tickets — never invent names, dates, prices, or commitments. Distinguish clearly between what was CLAIMED/promised and what is CONFIRMED. Separate visibility, leads, and bookings; do not treat rankings as bookings or a promise as a delivered fact. Where the context is silent, say so rather than guessing. Write clean professional prose with clear headers; be thorough.`;

export default function AiAssist({
  entityId,
  windowDays,
  focusBody,
  onClearFocus,
}: {
  entityId: string;
  windowDays: number;
  focusBody?: string | null;
  onClearFocus?: () => void;
}) {
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

  // The Communication tab unmounts when you switch to another section, which
  // used to wipe an in-progress prompt + its generated response. Persist the
  // assist state per account in sessionStorage so returning to Communication
  // restores exactly what was there. Keyed by entityId; survives tab switches
  // and back-navigation within the session (cleared only when the fields empty).
  const LS = `cave_assist_${entityId}`;
  const skipPersist = useRef(true);
  useEffect(() => {
    skipPersist.current = true; // don't let the mount-time persist wipe restored data
    try {
      const raw = sessionStorage.getItem(`cave_assist_${entityId}`);
      const s = raw ? JSON.parse(raw) : null;
      setFn(s?.fn || "");
      setType(s?.type || "");
      setUseCase(s?.useCase || "");
      setInstruction(s?.instruction || "");
      setResponse(s?.response ?? null);
      setError(s?.error ?? null);
    } catch { /* ignore corrupt state */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);
  useEffect(() => {
    if (skipPersist.current) { skipPersist.current = false; return; }
    try {
      if (!fn && !type && !useCase && !instruction && !response && !error) sessionStorage.removeItem(LS);
      else sessionStorage.setItem(LS, JSON.stringify({ fn, type, useCase, instruction, response, error }));
    } catch { /* storage full / disabled — non-fatal */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [LS, fn, type, useCase, instruction, response, error]);

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
        body: JSON.stringify({ instruction, window: windowDays, selectedBody: focusBody ?? null }),
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
        <span className="text-xs text-slate-400">· run the Account Analyser, pick a prompt, or write your own · reads the full communication history</span>
      </div>

      {focusBody && (
        <div className="mb-2 flex items-center gap-2 rounded-md border px-2 py-1 text-[11px]" style={{ borderColor: "var(--cave-line2)", color: "#a7c3c8" }}>
          <span style={{ color: "var(--cave-cy)" }}>🎯 Focused on selected message:</span>
          <span className="flex-1 truncate text-slate-400">{focusBody.slice(0, 90)}</span>
          <button onClick={onClearFocus} className="text-slate-400 hover:text-slate-200">✕</button>
        </div>
      )}

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

      {/* one-click comprehensive analysis */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => { setInstruction(ANALYSER_PROMPT); setResponse(null); setError(null); }}
          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold text-cyan-300 transition-colors hover:bg-cyan-400/10"
          style={{ borderColor: "var(--cave-line2)" }}>
          🔎 Account Analyser
        </button>
        <span className="text-[10px] text-slate-500">full-history handover-grade read · can take a minute or two</span>
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
