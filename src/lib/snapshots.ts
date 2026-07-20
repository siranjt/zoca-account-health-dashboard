import "server-only";
import { getSql, neonUrl } from "@/lib/neon";
import { getAccountsPayload } from "@/lib/data";

// Historical book snapshots (one row/day) in the isolated `alfred` schema.
// Powers the Trends explorer (aggregate columns) and the Activity feed (diff of
// consecutive days' per-account JSON). Threshold alerts run on live data, no DB.

interface AcctSnap { i: string; n: string; c: string; k: number | null; m: number | null; t: number; o: number | null }

async function ensureTable() {
  const sql = getSql();
  await sql.query(`CREATE SCHEMA IF NOT EXISTS alfred`);
  await sql.query(`CREATE TABLE IF NOT EXISTS alfred.book_daily (
    snapshot_date date PRIMARY KEY,
    accounts int, greens int, yellows int, reds int,
    total_mrr numeric, total_leads int, total_reviews int, total_tickets int, avg_composite numeric,
    accounts_json jsonb,
    created_at timestamptz DEFAULT now())`);
}

export async function takeSnapshot(): Promise<{ date: string; accounts: number }> {
  if (!neonUrl()) throw new Error("DATABASE_URL not set");
  await ensureTable();
  const sql = getSql();
  const { accounts: A } = await getAccountsPayload();
  const today = new Date().toISOString().slice(0, 10);
  const greens = A.filter((a) => a.health.color === "green").length;
  const yellows = A.filter((a) => a.health.color === "yellow").length;
  const reds = A.filter((a) => a.health.color === "red").length;
  const totalMrr = A.reduce((s, a) => s + (a.mrr ?? 0), 0);
  const totalLeads = A.reduce((s, a) => s + a.leadsReceived, 0);
  const totalReviews = A.reduce((s, a) => s + a.reviewsReceived, 0);
  const totalTickets = A.reduce((s, a) => s + a.openTickets, 0);
  const comps = A.map((a) => a.health.composite).filter((v): v is number => v != null);
  const avgComp = comps.length ? Math.round((comps.reduce((s, v) => s + v, 0) / comps.length) * 100) / 100 : null;
  const json = JSON.stringify(A.map((a): AcctSnap => ({ i: a.entityId, n: a.name, c: a.health.color, k: a.health.composite, m: a.mrr, t: a.openTickets, o: a.daysOverdue })));

  await sql`INSERT INTO alfred.book_daily
    (snapshot_date, accounts, greens, yellows, reds, total_mrr, total_leads, total_reviews, total_tickets, avg_composite, accounts_json)
    VALUES (${today}, ${A.length}, ${greens}, ${yellows}, ${reds}, ${totalMrr}, ${totalLeads}, ${totalReviews}, ${totalTickets}, ${avgComp}, ${json}::jsonb)
    ON CONFLICT (snapshot_date) DO UPDATE SET
      accounts=EXCLUDED.accounts, greens=EXCLUDED.greens, yellows=EXCLUDED.yellows, reds=EXCLUDED.reds,
      total_mrr=EXCLUDED.total_mrr, total_leads=EXCLUDED.total_leads, total_reviews=EXCLUDED.total_reviews,
      total_tickets=EXCLUDED.total_tickets, avg_composite=EXCLUDED.avg_composite, accounts_json=EXCLUDED.accounts_json, created_at=now()`;
  return { date: today, accounts: A.length };
}

export async function getBookTrend(): Promise<Record<string, unknown>[]> {
  if (!neonUrl()) return [];
  await ensureTable();
  return (await getSql()`
    SELECT snapshot_date::text d, accounts, greens, yellows, reds,
      total_mrr::float total_mrr, total_leads, total_reviews, total_tickets, avg_composite::float avg_composite
    FROM alfred.book_daily ORDER BY snapshot_date`) as Record<string, unknown>[];
}

export interface ActivityChange { entityId: string; name: string; kind: string; detail: string }

export async function getActivity(): Promise<{ from: string | null; to: string | null; changes: ActivityChange[] }> {
  if (!neonUrl()) return { from: null, to: null, changes: [] };
  await ensureTable();
  const rows = (await getSql()`SELECT snapshot_date::text d, accounts_json FROM alfred.book_daily ORDER BY snapshot_date DESC LIMIT 2`) as Array<{ d: string; accounts_json: AcctSnap[] }>;
  if (rows.length < 2) return { from: rows[1]?.d ?? null, to: rows[0]?.d ?? null, changes: [] };
  const [cur, prev] = rows;
  const prevMap = new Map<string, AcctSnap>();
  for (const a of prev.accounts_json || []) prevMap.set(a.i, a);
  const changes: ActivityChange[] = [];
  const tierLabel = (c: string) => (c === "red" ? "At risk" : c === "yellow" ? "Monitor" : "Healthy");
  for (const a of cur.accounts_json || []) {
    const p = prevMap.get(a.i);
    if (!p) { changes.push({ entityId: a.i, name: a.n, kind: "new", detail: "new to the book" }); continue; }
    if (p.c !== a.c) changes.push({ entityId: a.i, name: a.n, kind: a.c === "red" ? "risk" : a.c === "green" ? "recover" : "shift", detail: `health ${tierLabel(p.c)} → ${tierLabel(a.c)}` });
    if ((p.t ?? 0) !== (a.t ?? 0)) changes.push({ entityId: a.i, name: a.n, kind: (a.t ?? 0) > (p.t ?? 0) ? "risk" : "recover", detail: `tickets ${p.t ?? 0} → ${a.t ?? 0}` });
    const po = p.o ?? 0, ao = a.o ?? 0;
    if (po <= 0 && ao > 0) changes.push({ entityId: a.i, name: a.n, kind: "risk", detail: `went overdue (${ao}d)` });
    else if (po > 0 && ao <= 0) changes.push({ entityId: a.i, name: a.n, kind: "recover", detail: "cleared overdue" });
    const dm = (a.m ?? 0) - (p.m ?? 0);
    if (Math.abs(dm) >= 50) changes.push({ entityId: a.i, name: a.n, kind: dm > 0 ? "recover" : "risk", detail: `MRR ${dm > 0 ? "+" : ""}$${Math.round(dm)}` });
  }
  return { from: prev.d, to: cur.d, changes: changes.slice(0, 200) };
}
