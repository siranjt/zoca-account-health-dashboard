import { NextResponse } from "next/server";
import { runAssist } from "@/lib/aiassist";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  if (!UUID.test(id) && !/^[a-z0-9]{1,12}$/i.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const instruction = String(body?.instruction ?? "").slice(0, 20_000);
  const windowDays = Number(body?.window) || 90;
  const selectedBody = body?.selectedBody ? String(body.selectedBody).slice(0, 6000) : null;
  if (!instruction.trim()) return NextResponse.json({ error: "empty instruction" }, { status: 400 });

  const result = await runAssist(id, { instruction, windowDays, selectedBody });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
