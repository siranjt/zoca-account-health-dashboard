import { NextResponse } from "next/server";
import { getViewer } from "@/lib/scope";
import { getVoidInvoices, scopeVoidInvoices } from "@/lib/void";
import { getVoidAnnotations, setVoidAnnotation, type VoidAnnotation } from "@/lib/voidAnnotations";

// Void rep annotations — GET all + POST upsert. Visible to admin / manager / am
// (every reader can write, like the Beacon), but an AM may only write to an
// invoice within their own scoped book — checked server-side.
export const dynamic = "force-dynamic";
export const revalidate = 0;

function allowed(role: string | null) {
  return role === "admin" || role === "manager" || role === "am";
}

export async function GET() {
  const viewer = await getViewer();
  if (!allowed(viewer.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ annotations: await getVoidAnnotations() }, { headers: { "Cache-Control": "no-store" } });
}

const KEYS: (keyof VoidAnnotation)[] = ["caller", "connectionStatus", "amComment", "comments", "oldComments"];

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!allowed(viewer.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const invoiceNumber = String(body?.invoiceNumber || "").trim();
  if (!invoiceNumber) return NextResponse.json({ error: "invoiceNumber required" }, { status: 400 });

  // SECURITY: an AM may only annotate an invoice inside their own scoped book.
  if (viewer.role === "am") {
    const mine = scopeVoidInvoices(await getVoidInvoices(), viewer);
    if (!mine.some((r) => r.invoiceId === invoiceNumber)) {
      return NextResponse.json({ error: "forbidden — invoice not in your book" }, { status: 403 });
    }
  }

  const raw = (body?.patch || {}) as Record<string, unknown>;
  const patch: VoidAnnotation = {};
  for (const k of KEYS) if (k in raw) patch[k] = raw[k] == null ? "" : String(raw[k]);
  try {
    const annotation = await setVoidAnnotation(invoiceNumber, patch);
    return NextResponse.json({ ok: true, annotation });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
