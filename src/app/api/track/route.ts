import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { logActivity, type CaveRole } from "@/lib/activity";

// Client activity ingestion. The actor is read from the session (never trusted
// from the request body), so the log is authoritative. Returns 204 fast and
// does the write fire-and-forget.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const session = await auth();
  const u = session?.user as { email?: string | null; name?: string | null; role?: CaveRole; amName?: string | null } | undefined;
  if (!u?.email) return new NextResponse(null, { status: 204 }); // not signed in → ignore

  let body: { event?: unknown; surface?: unknown; entityId?: unknown; detail?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  const event = typeof body.event === "string" ? body.event.slice(0, 60) : "";
  if (!event) return new NextResponse(null, { status: 204 });

  await logActivity(
    { email: u.email ?? null, name: u.name ?? null, role: u.role ?? null, amName: u.amName ?? null },
    {
      event,
      surface: typeof body.surface === "string" ? body.surface.slice(0, 80) : null,
      entityId: typeof body.entityId === "string" ? body.entityId.slice(0, 64) : null,
      detail: body.detail && typeof body.detail === "object" ? (body.detail as Record<string, unknown>) : null,
    }
  );
  return new NextResponse(null, { status: 204 });
}
