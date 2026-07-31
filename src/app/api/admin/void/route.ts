import { NextResponse } from "next/server";
import { getViewer } from "@/lib/scope";
import { getVoidInvoices } from "@/lib/void";

// Admin-only unpaid-invoice book (Void). JSON by default; ?format=csv exports it.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(req: Request) {
  const viewer = await getViewer();
  if (viewer.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rows = await getVoidInvoices();

  if (new URL(req.url).searchParams.get("format") === "csv") {
    const esc = (v: unknown) => {
      const x = v == null ? "" : String(v);
      return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x;
    };
    const header = ["Invoice", "Business", "AM", "Status", "Amount due", "Currency", "Days overdue", "Date", "Due", "Auto-collect", "ACH in flight", "Phone", "Email", "State", "In book"];
    const body = rows.map((r) => [r.invoiceId, r.biz ?? "", r.amName ?? "", r.status, r.amountDue ?? "", r.currency ?? "", r.daysOverdue ?? "", r.invDate ?? "", r.dueDate ?? "", r.autoCollection ?? "", r.achInFlight ? "yes" : "no", r.phone ?? "", r.email ?? "", r.state ?? "", r.inBook ? "yes" : "no"]);
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
