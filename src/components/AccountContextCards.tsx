"use client";

import { useEffect, useState } from "react";
import type { AccountRow } from "@/lib/types";

// Tier-1 AM context cards for the dossier: Contact (who to call), Why at-risk
// (retention narrative), and Adoption & setup. Fetched from the account-context
// endpoint; the retention card also synthesizes signals already on the row.
type Ctx = {
  contact: { owners: string | null; phones: string[]; emails: string[]; address: string | null; category: string | null; domain: string | null };
  retention: { reason: string | null; freeText: string | null; at: string | null } | null;
  adoption: { onboardingState: string | null; bookingLinkAdded: boolean | null; leadPredictionViewed: boolean | null; integrations: string[]; billingState: string | null };
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--cave-line)", background: "var(--cave-panel)" }}>
      <div className="mb-2 text-sm font-semibold text-slate-700">{title}</div>
      {children}
    </div>
  );
}

function catLabel(c: string | null): string | null {
  if (!c) return null;
  try { const j = JSON.parse(c); if (Array.isArray(j)) return j.filter(Boolean).slice(0, 3).join(", ") || null; if (typeof j === "string") return j; } catch { /* not json */ }
  return c.length < 60 ? c : null;
}
const humanize = (s: string | null) => (s ? s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (m) => m.toUpperCase()) : null);
const yn = (b: boolean | null) => (b === true ? "✓" : b === false ? "✗" : "—");

export default function AccountContextCards({ account }: { account: AccountRow }) {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  useEffect(() => {
    let alive = true;
    setCtx(null);
    fetch(`/api/account/${account.entityId}/context`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setCtx(d))
      .catch(() => {});
    return () => { alive = false; };
  }, [account.entityId]);

  // "Why at-risk" — synthesized from the row + the cancellation reason
  const signals: string[] = [];
  const h = account.health;
  if (h?.reason) signals.push(h.reason);
  if ((account.failedPayments || 0) >= 2) signals.push(`${account.failedPayments} failed payments`);
  if ((account.daysOverdue ?? 0) > 0) signals.push(`Payment ${account.daysOverdue} day${account.daysOverdue === 1 ? "" : "s"} overdue`);
  if ((account.openTickets || 0) > 0) signals.push(`${account.openTickets} open support ticket${account.openTickets === 1 ? "" : "s"}`);
  if (ctx?.retention?.reason) signals.push(`Cancellation reason cited: ${ctx.retention.reason}${ctx.retention.freeText ? ` — "${ctx.retention.freeText.slice(0, 120)}"` : ""}`);

  const c = ctx?.contact;
  const hasContact = c && (c.owners || c.phones.length || c.emails.length || c.address);
  const a = ctx?.adoption;
  const showRisk = h?.color !== "green" || signals.length > 0;

  return (
    <>
      {/* Contact */}
      <Card title="Contact">
        {ctx == null ? (
          <div className="py-4 text-xs text-slate-400">Loading…</div>
        ) : !hasContact ? (
          <div className="py-4 text-xs text-slate-400">No contact details on file.</div>
        ) : (
          <div className="space-y-1.5 text-xs">
            {c!.owners && <div><span className="text-slate-400">Owner</span> <span className="font-medium text-slate-700">{c!.owners}</span></div>}
            {c!.phones.map((p) => (
              <div key={p}>📞 <a href={`tel:${p.replace(/[^\d+]/g, "")}`} className="text-slate-700 no-underline hover:text-indigo-600">{p}</a></div>
            ))}
            {c!.emails.map((e) => (
              <div key={e}>✉️ <a href={`mailto:${e}`} className="text-slate-700 no-underline hover:text-indigo-600">{e}</a></div>
            ))}
            {c!.address && <div className="text-slate-500">📍 {c!.address}</div>}
            {catLabel(c!.category) && <div className="text-slate-400">{catLabel(c!.category)}</div>}
          </div>
        )}
      </Card>

      {/* Why at-risk */}
      {showRisk && (
        <Card title="Why at-risk">
          {signals.length === 0 ? (
            <div className="py-4 text-xs text-slate-400">No specific risk signals flagged.</div>
          ) : (
            <ul className="space-y-1.5 text-xs text-slate-600">
              {signals.map((s, i) => (
                <li key={i} className="flex gap-1.5"><span className="text-red-500">•</span><span>{s}</span></li>
              ))}
            </ul>
          )}
          {h?.recommendedAction && (
            <div className="mt-2 rounded bg-white px-2 py-1 text-[11px] text-slate-500"><span className="font-medium text-slate-600">Action:</span> {h.recommendedAction}</div>
          )}
        </Card>
      )}

      {/* Adoption & setup */}
      <Card title="Adoption &amp; setup">
        {ctx == null ? (
          <div className="py-4 text-xs text-slate-400">Loading…</div>
        ) : (
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between"><span className="text-slate-400">Onboarding</span><span className="font-medium text-slate-700">{humanize(a!.onboardingState) || "—"}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Booking link added</span><span className="tabular-nums text-slate-600">{yn(a!.bookingLinkAdded)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Lead prediction viewed</span><span className="tabular-nums text-slate-600">{yn(a!.leadPredictionViewed)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Web app</span><span className="text-slate-600">{account.webAppActive ? "Active" : "—"}</span></div>
            {account.ccActiveDaysL28 != null && (
              <div className="flex justify-between"><span className="text-slate-400">App activity (28d)</span><span className="tabular-nums text-slate-600">{account.ccActiveDaysL28}d · {account.ccConversationsL28 ?? 0} convos</span></div>
            )}
            {a!.billingState && <div className="flex justify-between"><span className="text-slate-400">Billing</span><span className="text-slate-600">{humanize(a!.billingState)}</span></div>}
            <div className="pt-1">
              <span className="text-slate-400">Integrations: </span>
              {a!.integrations.length ? a!.integrations.map((p) => (
                <span key={p} className="mr-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{p}</span>
              )) : <span className="text-slate-400">none connected</span>}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
