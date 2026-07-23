"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LandingStats, RiskItem, ChartData } from "@/app/page";
import LandingCharts from "./LandingCharts";

// The landing deck: a cinematic hero over a live launchpad. Everything is
// dual-persona — it reads the active theme (html.light = Bruce Wayne) and
// swaps wording/glyphs, while colours ride the CSS tokens. Interactive bits
// (tiles, Alfred prompt, suggestions) dispatch the same window events the rest
// of the app already listens for. No layout/behaviour of other surfaces changes.
export default function LandingDeck({
  stats,
  atRisk,
  suggestions,
  charts,
  source,
}: {
  stats: LandingStats;
  atRisk: RiskItem[];
  suggestions: string[];
  charts: ChartData;
  source: "mock" | "metabase";
}) {
  const [light, setLight] = useState(false);
  const [ask, setAsk] = useState("");

  useEffect(() => {
    const upd = () => setLight(document.documentElement.classList.contains("light"));
    upd();
    const obs = new MutationObserver(upd);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const openAlfred = (prefill?: string) =>
    window.dispatchEvent(new CustomEvent("cave-open-alfred", { detail: { prefill } }));
  const openPalette = () => window.dispatchEvent(new CustomEvent("cave-open-palette"));

  const L = light
    ? {
        eyebrow: "Wayne Enterprises · Applied Sciences Division",
        sub: (
          <>One place to read the health of the portfolio — leads, reviews, rankings, GBP, payments and
          support — with <b style={{ color: "var(--cave-cy)" }}>Alfred</b> at your service across every Zoca ledger.</>
        ),
        cta: "Enter the Portfolio →",
        kLabels: ["Clients", "Stable", "At risk", "Avg health", "Value"],
        launch: "The Estate",
        risk: "Requires your attention",
        alfred: "Consult Alfred",
        placeholder: "Ask Alfred about the portfolio…",
        send: "Ring",
        overviewDesc: "The client ledger",
        riskTileTitle: "At-risk clients",
      }
    : {
        eyebrow: "Batcave · Account Health Grid",
        sub: (
          <>One place to read the health of the book — leads, reviews, rankings, GBP, payments and
          support — with <b style={{ color: "var(--cave-cy)" }}>Alfred</b> on hand to reason across every Zoca database.</>
        ),
        cta: "Enter the Overview →",
        kLabels: ["Accounts", "Healthy", "At risk", "Avg health", "MRR"],
        launch: "Command Deck",
        risk: "Threat board — needs attention",
        alfred: "Ask the Bat-Computer",
        placeholder: "Ask Alfred about the accounts…",
        send: "Ask",
        overviewDesc: "The account grid",
        riskTileTitle: "Threat board",
      };

  const kpis = [
    { label: L.kLabels[0], value: stats.total.toLocaleString("en-US"), tone: "var(--cave-txt)" },
    { label: L.kLabels[1], value: stats.greens.toLocaleString("en-US"), tone: "#16a34a" },
    { label: L.kLabels[2], value: stats.reds.toLocaleString("en-US"), tone: "#dc2626" },
    { label: L.kLabels[3], value: stats.avg ? stats.avg.toFixed(1) : "—", tone: "var(--cave-cy)" },
    { label: L.kLabels[4], value: stats.mrr ? "$" + stats.mrr.toLocaleString("en-US") : "—", tone: "var(--cave-txt)" },
  ];

  const tiles: { t: string; d: string; glyph: string; href?: string; ext?: string; onClick?: () => void }[] = [
    { t: "Overview", d: L.overviewDesc, glyph: "▦", href: "/overview" },
    { t: "Trends", d: "Health over time", glyph: "◠", href: "/trends" },
    { t: L.riskTileTitle, d: "Jump to the red accounts", glyph: "◉", href: "/overview?color=red" },
    { t: "Training", d: "CAVE//OS Training module", glyph: "🎓", ext: "/training.html" },
    { t: "Command search", d: "Find anything · ⌘K", glyph: "⌕", onClick: openPalette },
    { t: light ? "Ring for Alfred" : "Ask Alfred", d: "Reason over the live data", glyph: "⌾", onClick: () => openAlfred() },
  ];

  const rise = (i: number) => ({ animationDelay: `${0.04 * i}s` });

  return (
    <main className="mx-auto max-w-[1150px] px-6 pb-24">
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="flex flex-col items-center pt-16 text-center">
        <svg
          className="cave-emblem landing-rise mb-5"
          style={rise(0)}
          viewBox="0 0 100 44"
          width="78"
          height="34"
          aria-hidden="true"
        >
          <path
            fill="var(--cave-cy)"
            d="M50 3 C48 11 45 14 41 12 C43 16 42 19 39 20 C33 15 25 16 20 23 C26 21 30 23 31 27 C25 28 20 32 18 39 C24 34 33 33 37 37 C40 30 45 28 50 33 C55 28 60 30 63 37 C67 33 76 34 82 39 C80 32 75 28 69 27 C70 23 74 21 80 23 C75 16 67 15 61 20 C58 19 57 16 59 12 C55 14 52 11 50 3 Z"
          />
        </svg>
        <div className="cave-decode landing-rise mb-3 text-[10px] uppercase tracking-[0.32em]" style={{ ...rise(1), color: "var(--cave-dim)" }}>
          {L.eyebrow}
        </div>
        <div className="cave-brand landing-rise text-2xl font-bold tracking-[0.34em]" style={{ ...rise(1), color: "var(--cave-cy)" }}>
          CAVE//OS
        </div>
        <h1 className="landing-rise mt-3 text-balance text-4xl font-semibold tracking-tight sm:text-5xl" style={{ ...rise(2), color: "var(--cave-txt)" }}>
          Account Health Command Deck
        </h1>
        <p className="landing-rise mt-4 max-w-xl text-balance text-sm leading-relaxed" style={{ ...rise(3), color: "var(--cave-dim)" }}>
          {L.sub}
        </p>

        <div className="landing-rise mt-8 flex flex-wrap items-center justify-center gap-3" style={rise(4)}>
          <Link href="/overview" className="cave-cta rounded-lg px-5 py-2.5 text-sm font-semibold no-underline">
            {L.cta}
          </Link>
          <a
            href="/training.html"
            target="_blank"
            rel="noopener noreferrer"
            className="cave-cta2 rounded-lg px-5 py-2.5 text-sm font-semibold no-underline"
            style={{ color: "var(--cave-cy)", border: "1px solid var(--cave-line2)" }}
            title="CAVE//OS Training module"
          >
            🎓 {light ? "Begin orientation" : "Start training"}
          </a>
          <span
            className="rounded-md px-2 py-1 text-[11px] font-medium"
            style={{
              color: source === "metabase" ? "var(--cave-cy)" : "#d97706",
              background: source === "metabase" ? "rgba(53,224,255,.1)" : "rgba(217,119,6,.14)",
            }}
          >
            {source === "metabase" ? "● live · Metabase" : "● sample data"}
          </span>
        </div>

        {/* live book snapshot — .cave-kpis lets BatFX count-up + flash run */}
        {stats.total > 0 && (
          <div className="cave-kpis landing-rise mt-12 grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" style={rise(5)}>
            {kpis.map((k) => (
              <div key={k.label} className="cave-brk rounded-lg border border-slate-200 bg-white px-4 py-3 text-left shadow-sm">
                <div className="tabular-nums text-2xl font-semibold" style={{ color: k.tone }}>{k.value}</div>
                <div className="mt-0.5 text-[10px] uppercase tracking-wide" style={{ color: "var(--cave-dim)" }}>{k.label}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── LAUNCHPAD ────────────────────────────────────────────────────── */}
      <section className="mt-16">
        <SectionLabel>{L.launch}</SectionLabel>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {tiles.map((tile) =>
            tile.ext ? (
              <a key={tile.t} href={tile.ext} target="_blank" rel="noopener noreferrer" className="no-underline">
                <TileBody glyph={tile.glyph} t={tile.t} d={tile.d} />
              </a>
            ) : tile.href ? (
              <Link key={tile.t} href={tile.href} className="no-underline">
                <TileBody glyph={tile.glyph} t={tile.t} d={tile.d} />
              </Link>
            ) : (
              <button key={tile.t} onClick={tile.onClick} className="text-left">
                <TileBody glyph={tile.glyph} t={tile.t} d={tile.d} />
              </button>
            )
          )}
        </div>
      </section>

      {/* ── TACTICAL READOUT (live charts) ───────────────────────────────── */}
      {stats.total > 0 && <LandingCharts charts={charts} avg={stats.avg} />}

      {/* ── AT-RISK BOARD + ASK ALFRED ───────────────────────────────────── */}
      <section className="mt-14 grid gap-6 lg:grid-cols-2">
        {/* at-risk highlights */}
        <div>
          <SectionLabel>{L.risk}</SectionLabel>
          <div className="cave-brk overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            {atRisk.length === 0 && (
              <div className="px-4 py-6 text-center text-sm" style={{ color: "var(--cave-dim)" }}>
                Nothing critical right now — the book is holding.
              </div>
            )}
            {atRisk.map((a) => (
              <Link
                key={a.id}
                href={`/account/${a.id}`}
                className="cave-row cave-row-red flex items-center gap-3 border-b border-slate-200 px-4 py-3 no-underline last:border-b-0"
              >
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: "#dc2626", boxShadow: "0 0 8px #dc2626" }} aria-label="Critical" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold" style={{ color: "var(--cave-txt)" }}>{a.name}</div>
                  <div className="truncate text-[11px]" style={{ color: "var(--cave-dim)" }}>
                    {[a.city, a.state].filter(Boolean).join(", ") || "—"}
                    {a.am ? ` · ${a.am}` : ""}
                    {a.reason ? ` · ${a.reason} dragging` : ""}
                  </div>
                </div>
                <div className="tabular-nums text-lg font-semibold" style={{ color: "#dc2626" }}>{a.score ?? "—"}</div>
              </Link>
            ))}
          </div>
        </div>

        {/* ask alfred prompt + data-aware suggestions */}
        <div>
          <SectionLabel>{L.alfred}</SectionLabel>
          <div className="cave-brk rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex gap-2">
              <input
                value={ask}
                onChange={(e) => setAsk(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && ask.trim()) { openAlfred(ask.trim()); setAsk(""); } }}
                placeholder={L.placeholder}
                autoComplete="off"
                className="flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none"
                style={{ color: "var(--cave-txt)" }}
              />
              <button
                onClick={() => { if (ask.trim()) { openAlfred(ask.trim()); setAsk(""); } }}
                className="cave-cta rounded-md px-4 text-sm font-semibold"
              >
                {L.send}
              </button>
            </div>
            <div className="mt-3 text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--cave-dim)" }}>
              {light ? "Alfred suggests" : "Suggested queries"}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => openAlfred(s)}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-left text-xs transition-colors"
                  style={{ color: "var(--cave-dim)" }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="text-[10px] uppercase tracking-[0.28em]" style={{ color: "var(--cave-cy)" }}>◤◢ {children}</span>
      <span className="h-px flex-1" style={{ background: "var(--cave-line)" }} />
    </div>
  );
}

function TileBody({ glyph, t, d }: { glyph: string; t: string; d: string }) {
  return (
    <div className="cave-brk cave-tile h-full rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm transition-transform">
      <div className="text-xl" style={{ color: "var(--cave-cy)" }}>{glyph}</div>
      <div className="mt-2 text-sm font-semibold" style={{ color: "var(--cave-txt)" }}>{t}</div>
      <div className="mt-0.5 text-[11px]" style={{ color: "var(--cave-dim)" }}>{d}</div>
    </div>
  );
}
