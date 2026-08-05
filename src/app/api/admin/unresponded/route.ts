import { NextResponse } from "next/server";
import { getViewer } from "@/lib/scope";
import { getUnresponded, scopeUnresponded } from "@/lib/unresponded";

// Unresponded app-chat messages: conversations awaiting an AM reply. Visible to
// admin / manager / am; AMs are scoped server-side to their own accounts only
// (fail-closed). JSON by default; ?count=1 returns just the scoped count (for
// the command-deck tile badge); ?format=csv exports the SAME scoped set.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const viewer = await getViewer();
  if (viewer.role !== "admin" && viewer.role !== "manager" && viewer.role !== "am") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // SECURITY BOUNDARY: scope to the viewer BEFORE anything is returned/exported.
  let rows;
  try {
    rows = scopeUnresponded(await getUnresponded(), viewer);
  } catch {
    // Metabase unreachable/misconfigured: degrade to empty rather than 500 so
    // the tile badge and page show "nothing to chase", not a crash.
    return NextResponse.json({ rows: [], count: 0, unavailable: true }, { headers: { "Cache-Control": "no-store" } });
  }

  const { searchParams } = new URL(req.url);

  // Lightweight count for the deck tile badge — no message bodies over the wire.
  if (searchParams.get("count") === "1") {
    return NextResponse.json({ count: rows.length }, { headers: { "Cache-Control": "no-store" } });
  }

  if (searchParams.get("format") === "csv") {
    const esc = (v: unknown) => {
      const x = v == null ? "" : String(v);
      return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x;
    };
    const header = ["Account", "AM", "Waiting on", "Hours unresponded", "Missed invoice", "Last message", "Message time"];
    const body = rows.map((r) => [
      r.name ?? "",
      r.amName ?? "",
      r.sender ?? "",
      Math.round(r.hoursWaiting),
      r.hasMissedInvoice ? "yes" : "no",
      r.lastMessage ?? "",
      r.messageTime ?? "",
    ]);
    const csv = [header, ...body].map((r) => r.map(esc).join(",")).join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        "Content-Disposition": `attachment; filename="unresponded.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json({ rows }, { headers: { "Cache-Control": "no-store" } });
}
