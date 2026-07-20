"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

/**
 * CAVE//OS top navigation bar — shared across Landing, Overview and Detail.
 * Slim, sticky, themed. The brand logo returns to the landing page; the
 * links jump between the three surfaces of the deck.
 */
export default function CaveNav() {
  const path = usePathname() || "/";
  const onDetail = path.startsWith("/account/");

  const links: { href: string; label: string; match: (p: string) => boolean }[] = [
    { href: "/", label: "Home", match: (p) => p === "/" },
    { href: "/overview", label: "Overview", match: (p) => p === "/overview" || p.startsWith("/account") },
    { href: "/trends", label: "Trends", match: (p) => p === "/trends" },
  ];

  return (
    <nav
      className="sticky top-0 z-40 flex items-center gap-4 border-b px-4 py-2.5"
      style={{
        background: "linear-gradient(180deg, rgba(9,19,24,.96), rgba(5,11,14,.92))",
        borderColor: "var(--cave-line)",
        backdropFilter: "blur(6px)",
      }}
    >
      <Link href="/" className="flex items-baseline gap-2 no-underline">
        <span className="cave-brand text-sm font-bold tracking-[0.3em]" style={{ color: "var(--cave-cy)" }}>
          ◤◢ CAVE//OS
        </span>
        <span className="hidden text-[10px] uppercase tracking-[0.18em] sm:inline" style={{ color: "var(--cave-dim)" }}>
          Account Health Command Deck
        </span>
      </Link>

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

      <ThemeToggle />

      <div className="flex items-center gap-1 text-sm">
        {links.map((l, i) => {
          const active = l.match(path);
          return (
            <Link
              key={`${l.href}-${i}`}
              href={l.href}
              className="rounded-md px-3 py-1.5 font-medium no-underline transition-colors"
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
