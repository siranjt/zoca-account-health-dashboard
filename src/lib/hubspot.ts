// ===========================================================================
// Minimal HubSpot CRM v3 REST client.
//
// The app's HubSpot data normally comes from the Aurora warehouse (the stitched
// `hubspot_stitch.locations` table). Some fields, though, live on the HubSpot
// "Locations" custom object but are NOT synced to the warehouse — currently the
// per-location "Check in meeting URL". This client reaches those straight from
// the HubSpot API.
//
// Graceful degradation is a first principle (see CLAUDE.md §6): with no token —
// or if the target object/property can't be found — every function returns
// null/empty and the dependent feature simply hides. It never throws into a
// request path.
//
// Provisioning: create a HubSpot Private App (Settings → Integrations → Private
// Apps) with scopes `crm.objects.custom.read` + `crm.schemas.custom.read`, then
// set its token as HUBSPOT_ACCESS_TOKEN (HUBSPOT_TOKEN also accepted). The
// object type id and property name are
// auto-discovered from the schema; HUBSPOT_LOCATIONS_OBJECT_TYPE_ID and
// HUBSPOT_MEETING_URL_PROPERTY can pin them if discovery ever guesses wrong.
// ===========================================================================

const BASE = "https://api.hubapi.com";

// Private-app token. Vercel holds it as HUBSPOT_ACCESS_TOKEN; HUBSPOT_TOKEN is
// accepted as a fallback name.
function hubspotToken(): string | undefined {
  return process.env.HUBSPOT_ACCESS_TOKEN || process.env.HUBSPOT_TOKEN;
}

export function hubspotConfigured(): boolean {
  return !!hubspotToken();
}

async function hsGet(path: string, params?: Record<string, string>): Promise<any | null> {
  const token = hubspotToken();
  if (!token) return null;
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  try {
    const res = await fetch(`${BASE}${path}${qs}`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      // 404 = record/property simply absent — that's a normal "no data", stay quiet.
      if (res.status !== 404) {
        console.error(`[hubspot] GET ${path} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`[hubspot] GET ${path} failed:`, err);
    return null;
  }
}

// --- "Locations" custom object + "Check in meeting URL" property discovery -----
// Both are stable across the account's lifetime; discover once and cache for the
// process lifetime (refreshed every few hours). Env overrides win outright.
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

type Schema = { objectTypeId: string | null; meetingProp: string | null };
const SCHEMA_TTL_MS = 6 * 3_600_000; // 6h
let schemaCache: { at: number; value: Schema } | null = null;
let schemaInflight: Promise<Schema> | null = null;

async function discoverLocationSchema(): Promise<Schema> {
  const envObj = process.env.HUBSPOT_LOCATIONS_OBJECT_TYPE_ID || null;
  const envProp = process.env.HUBSPOT_MEETING_URL_PROPERTY || null;
  if (envObj && envProp) return { objectTypeId: envObj, meetingProp: envProp };

  const json = await hsGet("/crm/v3/schemas");
  const results: any[] = json?.results ?? [];
  // The custom object whose name/labels read like "Locations".
  const loc = results.find((s) => {
    const hay = [s?.name, s?.labels?.singular, s?.labels?.plural].map(norm).join(" ");
    return hay.includes("location");
  });
  const objectTypeId = envObj || loc?.objectTypeId || loc?.fullyQualifiedName || null;

  let meetingProp = envProp;
  if (!meetingProp && Array.isArray(loc?.properties)) {
    const hit = (x: string) =>
      x.includes("checkinmeeting") ||
      (x.includes("checkin") && x.includes("meeting")) ||
      (x.includes("check") && x.includes("meeting") && (x.includes("url") || x.includes("link")));
    const p = loc.properties.find((pr: any) => hit(norm(pr?.label)) || hit(norm(pr?.name)));
    meetingProp = p?.name || null;
  }
  if (!objectTypeId || !meetingProp) {
    console.error(`[hubspot] discovery incomplete — objectTypeId=${objectTypeId} meetingProp=${meetingProp}. ` +
      `Set HUBSPOT_LOCATIONS_OBJECT_TYPE_ID / HUBSPOT_MEETING_URL_PROPERTY to pin them.`);
  }
  return { objectTypeId, meetingProp };
}

async function locationSchema(): Promise<Schema> {
  if (schemaCache && Date.now() - schemaCache.at < SCHEMA_TTL_MS) return schemaCache.value;
  if (schemaInflight) return schemaInflight;
  schemaInflight = discoverLocationSchema()
    .then((v) => { schemaCache = { at: Date.now(), value: v }; return v; })
    .catch((e) => { console.error("[hubspot] schema discovery failed:", e); return { objectTypeId: null, meetingProp: null }; })
    .finally(() => { schemaInflight = null; });
  return schemaInflight;
}

// --- per-record "Check in meeting URL" ----------------------------------------
const URL_TTL_MS = 30 * 60_000; // 30 min
const urlCache = new Map<string, { at: number; url: string | null }>();

/** The "Check in meeting URL" for one HubSpot Locations record (hubspot_stitch.locations.id).
 *  Returns null when unconfigured, undiscoverable, or the record has no value. */
export async function getLocationMeetingUrl(recordId: string): Promise<string | null> {
  if (!hubspotConfigured() || !recordId) return null;
  const cached = urlCache.get(recordId);
  if (cached && Date.now() - cached.at < URL_TTL_MS) return cached.url;

  const { objectTypeId, meetingProp } = await locationSchema();
  if (!objectTypeId || !meetingProp) return null;

  const json = await hsGet(
    `/crm/v3/objects/${encodeURIComponent(objectTypeId)}/${encodeURIComponent(recordId)}`,
    { properties: meetingProp, archived: "false" },
  );
  const raw = json?.properties?.[meetingProp];
  const url = typeof raw === "string" && raw.trim() ? raw.trim() : null;
  urlCache.set(recordId, { at: Date.now(), url });
  return url;
}
