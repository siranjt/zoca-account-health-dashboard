import { NextResponse } from "next/server";

// On-demand website liveness check for the detail view. Fetches the account's
// website server-side and reports whether it loads (real up/down / broken-link
// detection) — the reliable per-account signal the overview column can't give.
// Cached in-memory ~1h per URL. SSRF-guarded: http(s) only, no private hosts.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

interface Check { url: string; ok: boolean; status: number | null; finalUrl: string | null; ms: number | null; error: string | null }

const cache = new Map<string, { at: number; data: Check }>();
const TTL = 60 * 60 * 1000;

// Block obviously-internal targets (defence in depth; URLs come from our own DB).
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h === "metadata.google.internal") return true;
  if (h === "127.0.0.1" || h === "0.0.0.0" || h === "::1") return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(h)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(h)) return true;
  if (/^169\.254\.\d+\.\d+$/.test(h)) return true; // link-local / cloud metadata
  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(h)) return true;
  return false;
}

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("url");
  if (!raw) return NextResponse.json({ error: "missing url" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json({ error: "unsupported scheme" }, { status: 400 });
  }
  if (isBlockedHost(target.hostname)) {
    return NextResponse.json({ error: "blocked host" }, { status: 400 });
  }

  const key = target.toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) {
    return NextResponse.json({ ...hit.data, cached: true }, { headers: { "Cache-Control": "no-store" } });
  }

  const started = Date.now();
  const build = (over: Partial<Check>): Check => ({ url: key, ok: false, status: null, finalUrl: null, ms: Date.now() - started, error: null, ...over });
  try {
    const r = await fetch(target.toString(), {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CAVE-OS website check)" },
    });
    const data = build({ ok: r.ok, status: r.status, finalUrl: r.url, ms: Date.now() - started });
    cache.set(key, { at: Date.now(), data });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error && e.name === "TimeoutError" ? "timed out" : "unreachable";
    const data = build({ ok: false, error: msg });
    cache.set(key, { at: Date.now(), data });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  }
}
