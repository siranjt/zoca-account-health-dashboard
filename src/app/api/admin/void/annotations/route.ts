import { NextResponse } from "next/server";
import { getViewer } from "@/lib/scope";
import { getVoidAnnotations, setVoidAnnotation, type VoidAnnotation } from "@/lib/voidAnnotations";

// Void rep annotations — GET all + POST upsert. Admin-gated. Mirrors the Miss
// Payment Beacon's annotations route (every reader can also write).
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const viewer = await getViewer();
  if (viewer.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ annotations: await getVoidAnnotations() }, { headers: { "Cache-Control": "no-store" } });
}

const KEYS: (keyof VoidAnnotation)[] = ["caller", "connectionStatus", "amComment", "comments", "oldComments"];

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (viewer.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const invoiceNumber = String(body?.invoiceNumber || "").trim();
  if (!invoiceNumber) return NextResponse.json({ error: "invoiceNumber required" }, { status: 400 });
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
