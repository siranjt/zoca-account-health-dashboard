import CaveNav from "@/components/CaveNav";

// Instant navigation skeleton. Rendered by each route's loading.tsx so a click
// paints a placeholder in <100ms (client-side) while the server component fetches
// — instead of the page hanging with no feedback until data is ready.

function Block({ h, className = "" }: { h?: number; className?: string }) {
  return (
    <div
      className={`animate-pulse rounded ${className}`}
      style={{ height: h, background: "var(--cave-panel)", border: "1px solid var(--cave-line)" }}
    />
  );
}

export function LoadingSkeleton({ variant = "generic" }: { variant?: "table" | "detail" | "generic" }) {
  return (
    <>
      <CaveNav />
      <main className="mx-auto max-w-[1600px] px-4 py-5">
        {variant === "table" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => <Block key={i} h={62} />)}
            </div>
            <Block h={38} />
            <div className="space-y-2">
              {Array.from({ length: 12 }).map((_, i) => <Block key={i} h={44} />)}
            </div>
          </div>
        )}
        {variant === "detail" && (
          <div className="space-y-4">
            <Block h={92} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => <Block key={i} h={60} />)}
            </div>
            <Block h={40} />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <Block key={i} h={200} />)}
            </div>
          </div>
        )}
        {variant === "generic" && (
          <div className="space-y-4">
            <Block h={58} />
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => <Block key={i} h={180} />)}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
