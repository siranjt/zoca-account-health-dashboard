import { NextResponse } from "next/server";
import { getChanges } from "@/lib/changes";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  if (!UUID.test(id) && !/^[a-z0-9]{1,12}$/i.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const { searchParams } = new URL(req.url);
  const w = Number(searchParams.get("window"));
  const payload = await getChanges(id, Number.isFinite(w) ? w : 90);
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
