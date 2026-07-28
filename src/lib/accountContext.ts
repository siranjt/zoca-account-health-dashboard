import "server-only";
import { queryAurora } from "@/lib/metabase";
import { getFactsByEntityId } from "@/lib/keeper";

// ===========================================================================
// Extra AM context for the account dossier (Tier 1): who to contact, why the
// account is at risk, and how adopted/set-up they are. All entity-scoped single-
// account reads — grounded in real warehouse fields, no invented values.
// ===========================================================================

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
const bool = (v: unknown): boolean | null => (v === true || v === "true" ? true : v === false || v === "false" ? false : null);
const split = (v: unknown): string[] => (str(v) ? String(v).split("|").map((s) => s.trim()).filter(Boolean) : []);
// dedupe phones that appear in multiple formats (e.g. 7247592222 vs (724) 759-2222)
const dedupPhones = (arr: string[]): string[] => {
  const seen = new Set<string>(); const out: string[] = [];
  for (const p of arr) { const d = p.replace(/\D/g, "").slice(-10); if (d && !seen.has(d)) { seen.add(d); out.push(p); } }
  return out;
};

export interface KeeperFactLite { topic: string; field: string; value: string }
export interface AccountContext {
  contact: { owners: string | null; phones: string[]; emails: string[]; address: string | null; category: string | null; domain: string | null };
  retention: { reason: string | null; freeText: string | null; at: string | null } | null;
  adoption: { onboardingState: string | null; bookingLinkAdded: boolean | null; leadPredictionViewed: boolean | null; integrations: string[]; billingState: string | null };
  keeper: { available: boolean; facts: KeeperFactLite[] };
}

const EMPTY: AccountContext = {
  contact: { owners: null, phones: [], emails: [], address: null, category: null, domain: null },
  retention: null,
  adoption: { onboardingState: null, bookingLinkAdded: null, leadPredictionViewed: null, integrations: [], billingState: null },
  keeper: { available: false, facts: [] },
};

export async function getAccountContext(entityId: string): Promise<AccountContext> {
  const id = UUID.test(entityId) ? entityId : entityId.replace(/[^a-z0-9-]/gi, "");
  if (!UUID.test(id)) return EMPTY;

  const contactSql = `SELECT
    (SELECT string_agg(DISTINCT trim(first_name||' '||coalesce(last_name,'')),' / ') FROM entities.users WHERE entity_id='${id}'::uuid AND trim(coalesce(first_name,'')||coalesce(last_name,''))<>'') owners,
    (SELECT string_agg(DISTINCT phone_number,'|') FROM entities.phones WHERE entity_id='${id}'::uuid) phones,
    (SELECT string_agg(DISTINCT email_address,'|') FROM entities.emails WHERE entity_id='${id}'::uuid AND email_address NOT ILIKE '%zoca%' AND email_address NOT ILIKE '%timely%') emails,
    (SELECT storefront_address FROM entities.businesses WHERE entity_id='${id}'::uuid LIMIT 1) address,
    (SELECT categories::text FROM entities.businesses WHERE entity_id='${id}'::uuid LIMIT 1) category,
    (SELECT domain FROM entities.businesses WHERE entity_id='${id}'::uuid LIMIT 1) domain`;

  const adoptionSql = `SELECT
    (SELECT onboarding_state FROM app.onboarding WHERE entity_id='${id}'::uuid ORDER BY updated_at DESC NULLS LAST LIMIT 1) onboarding_state,
    (SELECT is_booking_link_added FROM app.onboarding WHERE entity_id='${id}'::uuid ORDER BY updated_at DESC NULLS LAST LIMIT 1) booking_link,
    (SELECT is_lead_prediction_viewed FROM app.onboarding WHERE entity_id='${id}'::uuid ORDER BY updated_at DESC NULLS LAST LIMIT 1) lead_pred,
    (SELECT string_agg(DISTINCT platform_type,'|') FROM entities.integrated_platforms WHERE entity_id='${id}'::uuid AND is_valid=true) integrations,
    (SELECT state FROM entities.billing_state WHERE entity_id='${id}'::uuid ORDER BY updated_at DESC NULLS LAST LIMIT 1) billing_state`;

  const retentionSql = `SELECT cr.title reason, crr.free_text, crr.created_at::text at
    FROM entities.cancellation_reason_responses crr JOIN entities.cancellation_reasons cr ON cr.id=crr.reason_id
    WHERE crr.location_entity_id='${id}'::uuid ORDER BY crr.created_at DESC LIMIT 1`;

  const [c, a, r, k] = await Promise.all([
    queryAurora(contactSql).catch(() => [] as Record<string, unknown>[]),
    queryAurora(adoptionSql).catch(() => [] as Record<string, unknown>[]),
    queryAurora(retentionSql).catch(() => [] as Record<string, unknown>[]),
    getFactsByEntityId(id).catch(() => ({ available: false as const, reason: "err" })),
  ]);
  const cr = c[0] || {}, ar = a[0] || {}, rr = r[0];
  const keeper = "facts" in k
    ? { available: true, facts: k.facts.map((f) => ({ topic: f.topic, field: f.field, value: f.value })).filter((f) => f.value) }
    : { available: false, facts: [] };

  return {
    contact: { owners: str(cr.owners), phones: dedupPhones(split(cr.phones)), emails: split(cr.emails), address: str(cr.address), category: str(cr.category), domain: str(cr.domain) },
    retention: rr ? { reason: str(rr.reason), freeText: str(rr.free_text), at: str(rr.at) } : null,
    adoption: {
      onboardingState: str(ar.onboarding_state), bookingLinkAdded: bool(ar.booking_link), leadPredictionViewed: bool(ar.lead_pred),
      integrations: split(ar.integrations), billingState: str(ar.billing_state),
    },
    keeper,
  };
}
