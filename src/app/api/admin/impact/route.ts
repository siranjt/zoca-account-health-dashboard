import { NextResponse } from "next/server";
import { getViewer } from "@/lib/scope";
import { getImpact } from "@/lib/impact";
import { resolveDayRange } from "@/lib/istDate";

// Admin-only impact readout over cave_activity_log. JSON by default; ?format=csv
// returns the per-user adoption table for pasting into a doc.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const viewer = await getViewer();
  if (viewer.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  // ?from=YYYY-MM-DD&to=YYYY-MM-DD (IST calendar days, inclusive) or ?days=N.
  // Both resolve through the same helper, so the preset buttons and the date
  // picker cannot drift apart — and a bad range 400s instead of being clamped
  // into a window nobody asked for.
  const resolved = resolveDayRange(searchParams, { defaultDays: 30, maxDays: 365 });
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 400 });
  const readout = await getImpact(resolved.range);

  if (searchParams.get("format") === "csv") {
    const esc = (v: unknown) => {
      const x = v == null ? "" : String(v);
      return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x;
    };
    const header = ["Person", "Email", "Role", "AM book", "Events", "Account opens", "Distinct accounts", "Alfred asks", "Last seen"];
    const rows = readout.users.map((u) => [u.label, u.email, u.role ?? "", u.amName ?? "", u.events, u.opens, u.accounts, u.alfred, u.lastSeen ?? ""]);
    const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        // The range belongs in the filename. A number quoted without its period
        // is unciteable, and these CSVs get pasted into documents that outlive
        // the tab they came from.
        "Content-Disposition": `attachment; filename="cave-impact-${resolved.range.fromDate}_${resolved.range.toDate}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json(readout, { headers: { "Cache-Control": "no-store" } });
}
