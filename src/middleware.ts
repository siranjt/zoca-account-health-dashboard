import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ssoConfigured } from "@/lib/access";

// Gate for the whole app.
// - When Google SSO is configured (ACCESS_CONTROL + Google creds + AUTH_SECRET),
//   require a signed-in roster member; unauthenticated requests go to /signin.
// - Otherwise fall back to the previous optional Basic-auth password gate, so
//   this code can ship before SSO is turned on without locking anyone out.
export default auth((req) => {
  const p = req.nextUrl.pathname;

  // Public static assets in /public (images, fonts, .html, etc.) must load even
  // when signed out — e.g. the Alfred crest on the sign-in page. Anything with a
  // file extension is a static file, never a gated route.
  if (/\.[a-zA-Z0-9]+$/.test(p)) return NextResponse.next();

  if (ssoConfigured()) {
    if (p.startsWith("/api/auth") || p.startsWith("/api/cron") || p === "/signin") return NextResponse.next();
    if (!req.auth?.user) {
      const url = new URL("/signin", req.nextUrl.origin);
      url.searchParams.set("callbackUrl", p + (req.nextUrl.search || ""));
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // SSO is NOT fully configured. This path must FAIL CLOSED, never open: a
  // missing Google/AUTH_SECRET var — or a malformed ACCESS_CONTROL that flips
  // ssoConfigured() to false — is an operational failure, not a reason to drop
  // auth on an app holding customer PII. The only non-SSO way in is an EXPLICIT
  // Basic-auth password (DASHBOARD_PASSWORD). With no password set:
  //   • production/preview  → hard block (503), so env drift can't expose data;
  //   • local dev only      → allow through, so `next dev` isn't gated.
  const password = process.env.DASHBOARD_PASSWORD;
  const isDeployed = process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV === "production";

  if (!password) {
    if (isDeployed) {
      return new NextResponse(
        "Access denied — authentication is not configured. (SSO env missing or ACCESS_CONTROL invalid.)",
        { status: 503 },
      );
    }
    return NextResponse.next(); // local dev convenience only
  }

  const authz = req.headers.get("authorization");
  if (authz?.startsWith("Basic ")) {
    try {
      const pass = atob(authz.slice(6)).split(":").slice(1).join(":");
      if (pass === password) return NextResponse.next();
    } catch {
      /* fall through */
    }
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Zoca Account Health"' },
  });
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
