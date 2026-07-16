import { NextRequest, NextResponse } from "next/server";

// ===========================================================================
// Optional simple password gate.
// If DASHBOARD_PASSWORD is set, every request must pass HTTP Basic auth with
// that password (any username). If it's blank/unset, the app is open — in that
// case rely on Vercel's built-in Deployment Protection for customer data.
// ===========================================================================

export function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6));
      const pass = decoded.split(":").slice(1).join(":");
      if (pass === password) return NextResponse.next();
    } catch {
      /* fall through to challenge */
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Zoca Account Health"' },
  });
}

export const config = {
  // protect everything except Next internals & static assets
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
