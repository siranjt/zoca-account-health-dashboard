"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ThemeToggle from "./ThemeToggle";
import CalmToggle from "./CalmToggle";
import DetectiveToggle from "./DetectiveToggle";
import RainToggle from "./RainToggle";
import UserMenu from "./UserMenu";
import { WayneShield, BatShield } from "./WayneMark";

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
        <span
          className="cave-emblem inline-flex"
          aria-hidden="true"
          title={light ? "Wayne Enterprises" : "Bat-Signal"}
          style={{ cursor: "pointer", color: "var(--cave-cy)" }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.dispatchEvent(new CustomEvent("cave-batsignal")); }}>
          {light ? <WayneShield size={22} /> : <BatShield size={34} />}
        </span>
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

      <UserMenu>
        <RainToggle />
        <DetectiveToggle />
        <CalmToggle />
      </UserMenu>
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
