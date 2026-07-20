import { NextResponse } from "next/server";
import { getPromptCatalog, getPromptText } from "@/lib/prompts";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

// GET /api/prompts               → catalog metadata (function/type/useCase)
// GET /api/prompts?function=&type=&use_case=  → the single prompt text
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const fn = searchParams.get("function");
  const type = searchParams.get("type");
  const useCase = searchParams.get("use_case");
  try {
    if (fn && type && useCase) {
      const prompt = await getPromptText(fn, type, useCase);
      return NextResponse.json({ prompt: prompt ?? "" }, { headers: { "Cache-Control": "no-store" } });
    }
    const items = await getPromptCatalog();
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
