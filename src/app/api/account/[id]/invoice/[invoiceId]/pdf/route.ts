import { NextResponse } from "next/server";
import { getInvoicePdfUrl } from "@/lib/chargebee";

// Download one invoice's PDF. Resolves an entity-scoped, short-lived signed URL
// from Chargebee and redirects to it. getInvoicePdfUrl refuses invoices that
// don't belong to this account's Chargebee customer.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 20;

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function GET(_req: Request, { params }: { params: { id: string; invoiceId: string } }) {
  const id = decodeURIComponent(params.id);
  const invoiceId = decodeURIComponent(params.invoiceId);
  if (!UUID.test(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(invoiceId)) return NextResponse.json({ error: "invalid invoice id" }, { status: 400 });

  const url = await getInvoicePdfUrl(id, invoiceId).catch(() => null);
  if (!url) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.redirect(url, 302);
}
