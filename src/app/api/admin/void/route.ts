import { NextResponse } from "next/server";
import { getViewer } from "@/lib/scope";
import { getVoidInvoices, scopeVoidInvoices } from "@/lib/void";

// Unpaid-invoice book (Void). Visible to admin / manager / am. AMs are scoped
// server-side to their own accounts' invoices only (fail-closed). JSON by
// default; ?format=csv exports the SAME scoped set.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(req: Request) {
  const viewer = await getViewer();
  if (viewer.role !== "admin" && viewer.role !== "manager" && viewer.role !== "am") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  const all = await getVoidInvoices(sp.get("refresh") === "1");
  // SECURITY BOUNDARY: scope to the viewer BEFORE anything is returned/exported.
  const rows = scopeVoidInvoices(all, viewer);

  if (sp.get("format") === "csv") {
    const esc = (v: unknown) => {
      const x = v == null ? "" : String(v);
      return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x;
    };
    const header = ["Invoice", "Business", "AM", "Status", "Amount due", "Currency", "Days overdue", "Date", "Due", "Auto-collect", "ACH in flight", "Phone", "Email", "State", "In book", "Recoverability", "Recovery score", "Recovery action", "Engaged 30d"];
    const body = rows.map((r) => [r.invoiceId, r.biz ?? "", r.amName ?? "", r.status, r.amountDue ?? "", r.currency ?? "", r.daysOverdue ?? "", r.invDate ?? "", r.dueDate ?? "", r.autoCollection ?? "", r.achInFlight ? "yes" : "no", r.phone ?? "", r.email ?? "", r.state ?? "", r.inBook ? "yes" : "no", r.recovery.tier, r.recovery.score, r.recovery.action, r.recovery.engaged ? "yes" : "no"]);
    const csv = [header, ...body].map((r) => r.map(esc).join(",")).join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        "Content-Disposition": `attachment; filename="void-unpaid-invoices.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json({ rows }, { headers: { "Cache-Control": "no-store" } });
}
