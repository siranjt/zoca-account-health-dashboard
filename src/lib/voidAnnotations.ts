import "server-only";
import { getSql, neonUrl } from "@/lib/neon";

// ===========================================================================
// Void rep annotations — the call-tracking layer ported from the Miss Payment
// Beacon's miss_payment_annotations. One row per invoice, keyed by invoice
// number, JSONB payload so the shape can evolve without a migration. Self-
// provisions on first use (same pattern as cave_activity_log).
// ===========================================================================

export interface VoidAnnotation {
  caller?: string; // Shakthi | Joshi
  connectionStatus?: string; // Connected | VM | Not connected
  amComment?: string;
  comments?: string;
  oldComments?: string;
}
export type VoidAnnotationsMap = Record<string, VoidAnnotation>;

let ensured = false;
async function ensureTable() {
  if (ensured) return;
  const sql = getSql();
  await sql`CREATE TABLE IF NOT EXISTS void_annotations (
    invoice_number TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_void_annotations_updated ON void_annotations (updated_at DESC)`;
  ensured = true;
}

export function annotationsConfigured(): boolean {
  return !!neonUrl();
}

export async function getVoidAnnotations(): Promise<VoidAnnotationsMap> {
  if (!neonUrl()) return {};
  await ensureTable();
  const sql = getSql();
  const rows = await sql`SELECT invoice_number, data FROM void_annotations`;
  const out: VoidAnnotationsMap = {};
  for (const r of rows as Array<{ invoice_number: string; data: VoidAnnotation }>) {
    out[String(r.invoice_number)] = (r.data || {}) as VoidAnnotation;
  }
  return out;
}

/** Upsert — merge the patch onto the existing JSONB (blur-to-save semantics). */
export async function setVoidAnnotation(invoiceNumber: string, patch: VoidAnnotation): Promise<VoidAnnotation> {
  if (!neonUrl()) throw new Error("DATABASE_URL not set — annotations cannot be persisted");
  await ensureTable();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO void_annotations (invoice_number, data, updated_at)
    VALUES (${invoiceNumber}, ${JSON.stringify(patch)}::jsonb, now())
    ON CONFLICT (invoice_number) DO UPDATE
      SET data = void_annotations.data || EXCLUDED.data, updated_at = now()
    RETURNING data`;
  return ((rows as Array<{ data: VoidAnnotation }>)[0]?.data || {}) as VoidAnnotation;
}
