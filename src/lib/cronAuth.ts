import "server-only";
import { NextResponse } from "next/server";

// Shared gate for every /api/cron/* route.
//
// WHY THIS EXISTS. middleware.ts exempts the whole /api/cron prefix from the SSO
// redirect, so the bearer secret is the ONLY thing in front of these endpoints.
// The previous shape was:
//
//     const secret = process.env.CRON_SECRET;
//     if (secret) { ...verify... }        // <- unset secret = no auth at all
//
// which meant a missing or blank CRON_SECRET silently removed authentication
// from routes that write to Neon and return book-wide business aggregates.
// CLAUDE.md rule 6 allows graceful degradation everywhere EXCEPT auth, and this
// was auth degrading in the quietest possible way. A missing secret now closes
// the route instead of opening it.
//
// NO CONFIGURATION ORACLE. The header is read before the secret is checked and
// both failures return an identical 401, so an unauthenticated caller cannot
// tell "no secret configured" from "wrong secret" — otherwise one probe against
// a read endpoint tells an attacker exactly when the sibling write endpoints are
// unauthenticated. The misconfiguration is logged server-side instead.
//
// CONSTANT-TIME COMPARE. Digests first, so both sides are always 64 chars and
// the loop cannot exit early on length or on the first differing byte. Remote
// timing exploitation of a V8 string compare behind Vercel's network jitter is
// not realistic; this simply removes the question.

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false; // equal-length digests; never the raw secret
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Returns a 401 response when the caller is not the cron runner, or null when
 * the request may proceed. Fails CLOSED: no secret configured means no access.
 *
 *   const denied = await cronAuthFailure(req);
 *   if (denied) return denied;
 */
export async function cronAuthFailure(req: Request): Promise<NextResponse | null> {
  const secret = process.env.CRON_SECRET;
  const presented = req.headers.get("authorization") ?? "";

  if (!secret) {
    // Server-side only. Never name the missing variable in the response body.
    console.error("[cron-auth] CRON_SECRET is not set — refusing the request rather than opening it");
    return new NextResponse("unauthorized", { status: 401 });
  }

  const ok = constantTimeEqual(await sha256Hex(presented), await sha256Hex(`Bearer ${secret}`));
  return ok ? null : new NextResponse("unauthorized", { status: 401 });
}
