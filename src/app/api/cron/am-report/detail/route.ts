import { NextResponse } from "next/server";
import { neonUrl } from "@/lib/neon";
import { writeAmDetail, type DetailCell, type DetailSheet } from "@/lib/amDetail";

// Ingest for the account-level drill-down sheets — the write counterpart to the
// GET export the workbook already reads. The laptop workbook computes the seven
// detail sheets live (the snapshot holds per-AM aggregates only and cannot say
// WHICH accounts), and POSTs them here after the run so the app's xlsx export
// and the /am-report drill-down can serve the same rows without a second query
// implementation.
//
// Auth and placement mirror the sibling GET export exactly:
//   • bearer secret is REQUIRED, not optional — this writes production data;
//   • it lives under /api/cron so src/middleware.ts exempts it from the SSO
//     redirect (an unauthenticated write is worse than the read this sits beside,
//     hence the same closed-by-default posture).
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Coerce one untrusted sheet from the request body into a DetailSheet, or throw
 *  with a field-specific message. The workbook is the only caller, but a bad
 *  payload should fail loudly here rather than write malformed jsonb. */
function parseSheet(raw: unknown, i: number): DetailSheet {
  if (typeof raw !== "object" || raw === null) throw new Error(`sheets[${i}] is not an object`);
  const s = raw as Record<string, unknown>;
  if (typeof s.title !== "string" || !s.title) throw new Error(`sheets[${i}].title missing`);
  if (!Array.isArray(s.headers) || !s.headers.every((h) => typeof h === "string")) {
    throw new Error(`sheets[${i}].headers must be string[]`);
  }
  if (!Array.isArray(s.rows) || !s.rows.every((r) => Array.isArray(r))) {
    throw new Error(`sheets[${i}].rows must be an array of arrays`);
  }
  const totalRow =
    s.total_row === undefined || s.total_row === null
      ? null
      : Array.isArray(s.total_row)
        ? (s.total_row as DetailCell[])
        : (() => {
            throw new Error(`sheets[${i}].total_row must be an array or null`);
          })();
  const widths =
    s.widths === undefined || s.widths === null
      ? null
      : Array.isArray(s.widths) && s.widths.every((w) => typeof w === "number")
        ? (s.widths as number[])
        : (() => {
            throw new Error(`sheets[${i}].widths must be number[] or null`);
          })();
  return {
    title: s.title,
    headers: s.headers as string[],
    rows: s.rows as DetailCell[][],
    totalRow,
    notes: typeof s.notes === "string" ? s.notes : null,
    widths,
    seq: typeof s.seq === "number" ? s.seq : i,
  };
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured; this endpoint stays closed rather than open." },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  if (!neonUrl()) {
    return NextResponse.json({ ok: false, error: "no database configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "body must be JSON" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const date = b?.date;
  if (typeof date !== "string" || !DATE_RE.test(date)) {
    return NextResponse.json({ ok: false, error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  if (!Array.isArray(b.sheets) || !b.sheets.length) {
    return NextResponse.json({ ok: false, error: "sheets must be a non-empty array" }, { status: 400 });
  }

  let sheets: DetailSheet[];
  try {
    sheets = b.sheets.map((s, i) => parseSheet(s, i));
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message) }, { status: 400 });
  }

  try {
    const res = await writeAmDetail({ date, sheets });
    return NextResponse.json({ ok: true, ...res, titles: sheets.map((s) => s.title) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message) }, { status: 500 });
  }
}
