import Link from "next/link";
import { getAccountsPayload } from "@/lib/data";
import CaveNav from "@/components/CaveNav";

// Landing / home. Placeholder for now — to be designed later. Shows a live
// teaser from the book and routes into the Overview deck.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Landing() {
  let total = 0;
  let greens = 0;
  let reds = 0;
  let source: "mock" | "metabase" = "mock";
  try {
    const p = await getAccountsPayload();
    total = p.accounts.length;
    greens = p.accounts.filter((a) => a.health.color === "green").length;
    reds = p.accounts.filter((a) => a.health.color === "red").length;
    source = p.source;
  } catch {
    /* keep zeros if the book can't load */
  }

  return (
    <>
      <CaveNav />
      <main className="relative mx-auto flex min-h-[calc(100vh-49px)] max-w-[1100px] flex-col items-center justify-center px-6 py-16 text-center">
        <div className="cave-brand mb-4 text-xs tracking-[0.4em]" style={{ color: "var(--cave-cy)" }}>
          ◤◢ CAVE//OS
        </div>
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl" style={{ color: "var(--cave-txt)" }}>
          Account Health Command Deck
        </h1>
        <p className="mt-4 max-w-xl text-balance text-sm leading-relaxed" style={{ color: "#a7c3c8" }}>
          One place to read the health of the book — leads, reviews, rankings, GBP metrics,
          payments and support — with <span style={{ color: "var(--cave-cy)" }}>Alfred</span> on
          hand to reason across every Zoca database.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/overview"
            className="rounded-lg px-5 py-2.5 text-sm font-semibold no-underline"
            style={{
              color: "#03181e",
              background: "linear-gradient(180deg, var(--cave-cy), #1899b4)",
              boxShadow: "0 8px 26px rgba(0,0,0,.4), 0 0 18px rgba(53,224,255,.28)",
            }}
          >
            Enter the Overview →
          </Link>
          <span className="text-xs" style={{ color: "var(--cave-dim)" }}>
            Ask Alfred anytime — launcher, bottom-left ↙
          </span>
        </div>

        {total > 0 && (
          <div className="mt-14 flex flex-wrap items-center justify-center gap-3">
            <Teaser label="Accounts in book" value={total} />
            <Teaser label="Healthy" value={greens} tone="#16a34a" />
            <Teaser label="At risk" value={reds} tone="#dc2626" />
            <span
              className="rounded-md px-2 py-1 text-[11px] font-medium"
              style={{
                color: source === "metabase" ? "#5eead4" : "#fbbf24",
                background: source === "metabase" ? "rgba(16,185,129,.12)" : "rgba(217,119,6,.14)",
              }}
            >
              {source === "metabase" ? "live · Metabase" : "sample data"}
            </span>
          </div>
        )}

        <div className="mt-16 text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--cave-dim)" }}>
          Landing — design pending
        </div>
      </main>
    </>
  );
}

function Teaser({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div
      className="min-w-[130px] rounded-lg border px-4 py-3 text-left"
      style={{ borderColor: "var(--cave-line)", background: "var(--cave-panel)" }}
    >
      <div className="text-2xl font-semibold tabular-nums" style={{ color: tone ?? "var(--cave-txt)" }}>
        {value}
      </div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide" style={{ color: "var(--cave-dim)" }}>
        {label}
      </div>
    </div>
  );
}
