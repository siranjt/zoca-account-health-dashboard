import "server-only";
import Papa from "papaparse";

// ===========================================================================
// The lean BaseSheet — the Miss Payment Beacon's authoritative identity/contact
// source (customer_id, entity_id, bizname, am_name, phone, email). A public
// Metabase CSV, indexed by entity_id AND customer_id so an invoice can be
// enriched by either key. Used to fill blanks for off-book invoices (accounts
// not in cx.health_score). Cached 10 min; degrades to empty on any failure.
// ===========================================================================

const CSV_URL = process.env.BASESHEET_CSV_URL
  || "https://metabase.zoca.ai/public/question/e9005a5c-4b5c-405d-af35-a69063c996e5.csv";

export interface BaseSheetRow { bizname: string; amName: string; phone: string; email: string }
export interface BaseSheetIndex { byEntity: Map<string, BaseSheetRow>; byCustomer: Map<string, BaseSheetRow> }

const EMPTY: BaseSheetIndex = { byEntity: new Map(), byCustomer: new Map() };
const TTL_MS = 10 * 60_000;
let cache: { at: number; idx: BaseSheetIndex } | null = null;
let inflight: Promise<BaseSheetIndex> | null = null;

export async function getBaseSheet(): Promise<BaseSheetIndex> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.idx;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(CSV_URL, { cache: "no-store", redirect: "follow" });
      if (!res.ok) return EMPTY;
      const text = await res.text();
      const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
      const byEntity = new Map<string, BaseSheetRow>();
      const byCustomer = new Map<string, BaseSheetRow>();
      for (const r of parsed.data) {
        const row: BaseSheetRow = {
          bizname: (r.bizname || "").trim(),
          amName: (r.am_name || "").trim(),
          phone: (r.phone_number || "").trim(),
          email: (r.app_email || "").trim(),
        };
        const eid = (r.entity_id || "").trim().toLowerCase();
        const cid = (r.customer_id || "").trim();
        if (eid) byEntity.set(eid, row);
        if (cid) byCustomer.set(cid, row);
      }
      const idx = { byEntity, byCustomer };
      if (byEntity.size || byCustomer.size) cache = { at: Date.now(), idx };
      return idx;
    } catch {
      return EMPTY;
    }
  })().finally(() => { inflight = null; });
  return inflight;
}

/** Look up by entity_id first, then customer_id (mirrors the Beacon). */
export function lookupBaseSheet(idx: BaseSheetIndex, entityId: string | null, customerId: string | null): BaseSheetRow | null {
  if (entityId) { const r = idx.byEntity.get(entityId.toLowerCase()); if (r) return r; }
  if (customerId) { const r = idx.byCustomer.get(customerId); if (r) return r; }
  return null;
}
