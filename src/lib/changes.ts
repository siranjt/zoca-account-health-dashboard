import "server-only";
import { queryAurora } from "@/lib/metabase";

// ===========================================================================
// SP (Service-Provider) Changes Log — an account-level audit trail of edits
// made to a customer's assets, ported from the Retool "SP Changes Log" app.
//
// Each source is a *_logs table whose updates_json is { field: {old, new} }.
// We unnest it (jsonb_each → change_obj->>'old'/'new'), scope to the entity,
// window it, then merge every source into one newest-first feed — the same
// shape as the Communication tab, but for changes instead of messages.
// ===========================================================================

export interface ChangeEntry {
  source: string; // Profile / Services / FAQs / Website / CTAs / Media
  at: string | null; // timestamp (text)
  label: string | null; // context: service name, CTA text, attribute/section, cover
  field: string; // the field that changed
  oldValue: string | null;
  newValue: string | null;
}
export interface ChangesPayload {
  windowDays: number;
  entries: ChangeEntry[];
  bySource: Record<string, number>;
  total: number;
  capped: boolean;
}

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const TOTAL_CAP = 800; // merged changes returned
const VAL_CAP = 1500; // per-value chars

// Purely-technical / foreign-key fields that carry no human meaning in a feed.
const NOISE = [
  "updated_by", "updated_at", "created_by", "created_at", "log_id", "id",
  "updated_at_timestamp", "order_index", "source_id", "image_id", "media_id",
  "view_count", "thumbnail_url", "google_url", "profile_photo_url", "profile_url",
  "width_pixels", "height_pixels", "deleted_by", "deleted_at", "source_url", "takedown_url",
].map((f) => `'${f}'`).join(",");

// One SQL builder per change source — each entity-scoped, windowed and LIMITed.
// All return the same columns: at · label · field · old_value · new_value.
function sourceSqls(id: string, days: number): { source: string; sql: string }[] {
  const w = Number.isFinite(days) && days > 0 ? Math.round(days) : 90;
  const tail = `CROSS JOIN LATERAL jsonb_each(updates_json) top(key,value)`;
  return [
    {
      source: "Profile",
      sql: `SELECT updated_at_timestamp at, NULL::text label, top.key field, top.value->>'old' old_value, top.value->>'new' new_value
        FROM entities.entities_logs ${tail}
        WHERE entity_id='${id}'::uuid AND updated_at_timestamp >= now()-interval '${w} days' AND top.key NOT IN (${NOISE})
        ORDER BY 1 DESC LIMIT 300`,
    },
    {
      source: "Services",
      sql: `SELECT ss.updated_at_timestamp at, ss.name label, top.key field, top.value->>'old' old_value, top.value->>'new' new_value
        FROM services.services_logs ss
        JOIN services.services_entities sse ON ss.id::text=sse.service_id::text
        CROSS JOIN LATERAL jsonb_each(ss.updates_json) top(key,value)
        WHERE sse.entity_id='${id}'::uuid AND ss.updated_at_timestamp >= now()-interval '${w} days' AND top.key NOT IN (${NOISE})
        ORDER BY 1 DESC LIMIT 300`,
    },
    {
      source: "FAQs",
      sql: `SELECT updated_at_timestamp at, NULL::text label, top.key field, top.value->>'old' old_value, top.value->>'new' new_value
        FROM entities.faqs_logs ${tail}
        WHERE entity_id='${id}'::uuid AND updated_at_timestamp >= now()-interval '${w} days' AND top.key NOT IN (${NOISE})
        ORDER BY 1 DESC LIMIT 300`,
    },
    {
      source: "Website",
      sql: `SELECT wa.updated_at_timestamp at, wa.attribute_name label, top.key field, top.value->>'old' old_value, top.value->>'new' new_value
        FROM website.attributes_logs wa
        JOIN website.page_sections ps ON ps.id::text=wa.parent_id::text
        JOIN website.website_pages wp ON wp.id::text=ps.page_id::text
        JOIN entities.product_entities pe ON pe.id::text=wp.website_id::text
        CROSS JOIN LATERAL jsonb_each(wa.updates_json) top(key,value)
        WHERE pe.entity_id='${id}'::uuid AND wa.parent_type='SECTION' AND pe.product_id=1 AND wa.updated_at_timestamp >= now()-interval '${w} days' AND top.key NOT IN (${NOISE})
        ORDER BY 1 DESC LIMIT 300`,
    },
    {
      source: "CTAs",
      sql: `SELECT cl.updated_at_timestamp at, cl.text label, top.key field, top.value->>'old' old_value, top.value->>'new' new_value
        FROM website.ctas_logs cl
        JOIN entities.product_entities pe ON pe.id::text=cl.parent_id::text
        CROSS JOIN LATERAL jsonb_each(cl.updates_json) top(key,value)
        WHERE pe.entity_id='${id}'::uuid AND cl.parent_type='WEBSITE' AND pe.product_id=1 AND cl.updated_at_timestamp >= now()-interval '${w} days' AND top.key NOT IN (${NOISE})
        ORDER BY 1 DESC LIMIT 300`,
    },
    {
      source: "Media",
      sql: `SELECT updated_at_timestamp at, category label, top.key field, top.value->>'old' old_value, top.value->>'new' new_value
        FROM gbp.media_items_logs ${tail}
        WHERE entity_id='${id}'::uuid AND updated_at_timestamp >= now()-interval '${w} days' AND top.key NOT IN (${NOISE})
        ORDER BY 1 DESC LIMIT 200`,
    },
  ];
}

const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
const clamp = (v: string | null): string | null => (v && v.length > VAL_CAP ? v.slice(0, VAL_CAP) + "…" : v);

export async function getChanges(entityId: string, windowDays: number): Promise<ChangesPayload> {
  const id = UUID.test(entityId) ? entityId : String(entityId).replace(/[^a-z0-9-]/gi, "");
  const w = Number.isFinite(windowDays) && windowDays > 0 ? Math.round(windowDays) : 90;

  const sources = sourceSqls(id, w);
  const runs = sources.map((s) => queryAurora(s.sql).catch(() => [] as Record<string, unknown>[]));
  const results = await Promise.all(runs);

  let entries: ChangeEntry[] = results.flatMap((rows, i) =>
    rows.map((r) => ({
      source: sources[i].source,
      at: str(r.at),
      label: str(r.label),
      field: String(r.field ?? "—"),
      oldValue: clamp(str(r.old_value)),
      newValue: clamp(str(r.new_value)),
    }))
  );
  entries.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  const total = entries.length;
  const capped = total > TOTAL_CAP;
  if (capped) entries = entries.slice(0, TOTAL_CAP);

  const bySource: Record<string, number> = {};
  for (const e of entries) bySource[e.source] = (bySource[e.source] ?? 0) + 1;

  return { windowDays: w, entries, bySource, total, capped };
}
