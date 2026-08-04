import { NextResponse } from "next/server";
import { getViewer } from "@/lib/scope";
import { getImpact } from "@/lib/impact";

// Admin-only impact readout over cave_activity_log. JSON by default; ?format=csv
// returns the per-user adoption table for pasting into a doc.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const viewer = await getViewer();
  if (viewer.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const days = Math.min(365, Math.max(1, Number(searchParams.get("days")) || 30));
  const readout = await getImpact(days);

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
        "Content-Disposition": `attachment; filename="cave-impact-${days}d.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json(readout, { headers: { "Cache-Control": "no-store" } });
}
