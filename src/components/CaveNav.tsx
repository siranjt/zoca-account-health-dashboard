"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ThemeToggle from "./ThemeToggle";
import CalmToggle from "./CalmToggle";
import DetectiveToggle from "./DetectiveToggle";
import RainToggle from "./RainToggle";

/**
 * CAVE//OS top navigation bar — shared across Landing, Overview and Detail.
 * Slim, sticky, themed. The brand logo returns to the landing page; the
 * links jump between the three surfaces of the deck.
 */
export default function CaveNav() {
  const path = usePathname() || "/";
  const onDetail = path.startsWith("/account/");

  // sync the bar's wording to the active persona (Batman dark / Wayne light)
  const [light, setLight] = useState(false);
  useEffect(() => {
    const upd = () => setLight(document.documentElement.classList.contains("light"));
    upd();
    const obs = new MutationObserver(upd);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const links: { href: string; label: string; match: (p: string) => boolean }[] = [
    { href: "/", label: "Home", match: (p) => p === "/" },
    { href: "/overview", label: "Overview", match: (p) => p === "/overview" || p.startsWith("/account") },
    { href: "/trends", label: "Trends", match: (p) => p === "/trends" },
  ];

  return (
    <nav
      className="cave-nav sticky top-0 z-40 flex items-center gap-4 border-b px-4 py-2.5"
      style={{
        borderColor: "var(--cave-line)",
        backdropFilter: "blur(6px)",
      }}
    >
      <Link href="/" className="flex items-center gap-2.5 no-underline">
        <svg
          className="cave-emblem"
          viewBox="0 0 100 44"
          width="34"
          height="15"
          aria-hidden="true"
          style={{ cursor: "pointer" }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.dispatchEvent(new CustomEvent("cave-batsignal")); }}>
          <path fill="var(--cave-cy)" d="M50 3 C48 11 45 14 41 12 C43 16 42 19 39 20 C33 15 25 16 20 23 C26 21 30 23 31 27 C25 28 20 32 18 39 C24 34 33 33 37 37 C40 30 45 28 50 33 C55 28 60 30 63 37 C67 33 76 34 82 39 C80 32 75 28 69 27 C70 23 74 21 80 23 C75 16 67 15 61 20 C58 19 57 16 59 12 C55 14 52 11 50 3 Z" />
        </svg>
        <span className="cave-brand text-sm font-bold tracking-[0.3em]" style={{ color: "var(--cave-cy)" }}>
          CAVE//OS
        </span>
        <span className="cave-decode hidden text-[10px] uppercase tracking-[0.18em] sm:inline" style={{ color: "var(--cave-dim)" }}>
          {light ? "Wayne Enterprises · Account Portfolio" : "Bat-Computer · Account Health Grid"}
        </span>
      </Link>

      <span className="cave-live ml-3 hidden items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] md:inline-flex" title="Live Metabase feed">
        <b className="cave-pulse" style={{ display: "inline-block" }}></b> {light ? "Markets open" : "Live feed"}
        <span className="text-slate-500">·</span>
        <span id="cave-clock" className="tabular-nums" style={{ color: "var(--cave-cy)" }}>--:--:--</span>
      </span>

      <button
        onClick={() => window.dispatchEvent(new CustomEvent("cave-open-palette"))}
        className="ml-auto flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs"
        style={{ borderColor: "var(--cave-line)", color: "var(--cave-dim)" }}
        title="Search accounts & actions (⌘K)"
      >
        <span>🔍</span>
        <span className="hidden sm:inline">Search…</span>
        <kbd className="rounded px-1 text-[10px]" style={{ background: "var(--cave-line)", color: "#a7c3c8" }}>⌘K</kbd>
      </button>

      <RainToggle />
      <DetectiveToggle />
      <CalmToggle />
      <ThemeToggle />

      <div className="flex items-center gap-1 text-sm">
        {links.map((l, i) => {
          const active = l.match(path);
          return (
            <Link
              key={`${l.href}-${i}`}
              href={l.href}
              className={`cave-navlink${active ? " cave-navlink-active" : ""} rounded-md px-3 py-1.5 font-medium no-underline transition-colors`}
              style={
                active
                  ? { color: "var(--cave-cy)", background: "rgba(53,224,255,.1)", border: "1px solid var(--cave-line2)" }
                  : { color: "#a7c3c8", border: "1px solid transparent" }
              }
            >
              {l.label}
            </Link>
          );
        })}
        <a
          href="/training.html"
          target="_blank"
          rel="noopener noreferrer"
          className="cave-navlink rounded-md px-3 py-1.5 font-medium no-underline transition-colors"
          style={{ color: "#a7c3c8", border: "1px solid transparent" }}
          title="CAVE//OS Training module"
        >
          🎓 Training
        </a>
      </div>

      {onDetail && (
        <Link
          href="/overview"
          className="rounded-md px-3 py-1.5 text-sm font-medium no-underline"
          style={{ color: "var(--cave-dim)", border: "1px solid var(--cave-line)" }}
        >
          ← Back to book
        </Link>
      )}
    </nav>
  );
}
