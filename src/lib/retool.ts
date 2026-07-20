import "server-only";
import { queryAurora } from "@/lib/metabase";
import { RETOOL_QUERIES } from "@/lib/retoolQueries";

// Runs every query from the Retool "Customer Dashboard" export for one account.
// Each query's `__ENTITY_ID__` placeholder is substituted with the (validated)
// entity id, executed against Aurora via Metabase, and returned with its rows,
// the exact SQL run, and any error — so the detail page can render each widget
// plus a "View SQL" expander. Derived queries (that depend on other queries'
// outputs) are returned SQL-only, not executed.

export interface RetoolQueryResult {
  name: string;
  section: string;
  runnable: boolean;
  deps: string[];
  sql: string; // exact SQL executed (entity id substituted)
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  error: string | null;
  ms: number;
}

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ROW_CAP = 300; // rows returned per query (Metabase may return more)

async function pool<T, R>(items: T[], size: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

export async function runRetoolQueries(entityId: string): Promise<RetoolQueryResult[]> {
  // Defensive: only a real UUID is interpolated verbatim; anything else is
  // stripped to the uuid charset so it can't break out of the string literal.
  const id = UUID.test(entityId) ? entityId : String(entityId).replace(/[^a-z0-9-]/gi, "");

  return pool(RETOOL_QUERIES, 10, async (q): Promise<RetoolQueryResult> => {
    const sql = q.sql.split("__ENTITY_ID__").join(id);
    const base = { name: q.name, section: q.section, runnable: q.runnable, deps: q.deps, sql };
    if (!q.runnable) {
      return { ...base, columns: [], rows: [], rowCount: 0, error: `Derived — depends on: ${q.deps.join(", ") || "other queries"}`, ms: 0 };
    }
    const t0 = Date.now();
    try {
      const rows = await queryAurora(sql);
      const columns = rows.length ? Object.keys(rows[0]) : [];
      return { ...base, columns, rows: rows.slice(0, ROW_CAP), rowCount: rows.length, error: null, ms: Date.now() - t0 };
    } catch (e) {
      return { ...base, columns: [], rows: [], rowCount: 0, error: String((e as Error)?.message || e).slice(0, 300), ms: Date.now() - t0 };
    }
  });
}
