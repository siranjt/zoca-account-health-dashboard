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

  if (ssoConfigured()) {
    if (p.startsWith("/api/auth") || p === "/signin") return NextResponse.next();
    if (!req.auth?.user) {
      const url = new URL("/signin", req.nextUrl.origin);
      url.searchParams.set("callbackUrl", p + (req.nextUrl.search || ""));
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // legacy password gate
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();
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
