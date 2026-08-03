"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { track } from "@/lib/track";

type U = { name?: string; email?: string; role?: string; amName?: string };

// Shows who's signed in + their role + a sign-out button. Renders nothing when
// SSO is off (no session), so the nav is unchanged until Google login is live.
export default function UserMenu() {
  const [u, setU] = useState<U | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      // Show the menu whenever someone is signed in (has an email) — NOT only
      // when a role resolves. Otherwise a bad ACCESS_CONTROL parse would strip
      // even the Sign-out button and trap the user with no way out.
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (s && s.user && (s.user.email || s.user.name)) setU(s.user); })
      .catch(() => {});
  }, []);

  if (!u) return null;

  const roleLabel =
    u.role === "admin" ? "Admin" :
    u.role === "manager" ? "Manager" :
    u.role === "am" ? `AM · ${u.amName || "—"}` :
    "no role — check ACCESS_CONTROL";
  const NAME_OVERRIDES: Record<string, string> = {}; // per-email greeting overrides (none — use the SSO name)
  const first = NAME_OVERRIDES[(u.email || "").toLowerCase()] || (u.name || u.email || "").split(" ")[0];

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-[11px] sm:inline" title={u.email} style={{ color: "var(--cave-dim)" }}>
        {first} <span style={{ color: "var(--cave-cy)" }}>· {roleLabel}</span>
      </span>
      {u.role === "admin" && (
        <>
          <a
            href="/admin/impact"
            title="Impact & adoption (admin)"
            className="rounded-md border px-2 py-1.5 text-[10px] uppercase tracking-[0.12em] no-underline"
            style={{ borderColor: "var(--cave-line)", color: "var(--cave-dim)" }}
          >
            📈 Impact
          </a>
          <a
            href="/admin/activity"
            title="Activity log (admin)"
            className="rounded-md border px-2 py-1.5 text-[10px] uppercase tracking-[0.12em] no-underline"
            style={{ borderColor: "var(--cave-line)", color: "var(--cave-dim)" }}
          >
            📋 Activity
          </a>
          <a
            href="/am-report"
            title="AM daily report — snapshot trend (owner only)"
            className="rounded-md border px-2 py-1.5 text-[10px] uppercase tracking-[0.12em] no-underline"
            style={{ borderColor: "var(--cave-line)", color: "var(--cave-dim)" }}
          >
            📒 AM Report
          </a>
          <a
            href="/admin/alfred"
            title="Alfred usage (admin)"
            className="rounded-md border px-2 py-1.5 text-[10px] uppercase tracking-[0.12em] no-underline"
            style={{ borderColor: "var(--cave-line)", color: "var(--cave-dim)" }}
          >
            🤖 Alfred
          </a>
        </>
      )}
      {(u.role === "admin" || u.role === "manager" || u.role === "am") && (
        <>
          <a
            href="/admin/lead-droughts"
            title={u.role === "am" ? "Your quiet accounts — no incoming leads" : "Accounts gone quiet — no incoming leads"}
            className="rounded-md border px-2 py-1.5 text-[10px] uppercase tracking-[0.12em] no-underline"
            style={{ borderColor: "var(--cave-line)", color: "var(--cave-dim)" }}
          >
            🦇 Bat-Signal
          </a>
          <a
            href="/admin/void"
            title={u.role === "am" ? "Your unpaid invoices" : "Unpaid-invoice book"}
            className="rounded-md border px-2 py-1.5 text-[10px] uppercase tracking-[0.12em] no-underline"
            style={{ borderColor: "var(--cave-line)", color: "var(--cave-dim)" }}
          >
            🃏 Rogues
          </a>
        </>
      )}
      <button
        onClick={() => { track("sign_out"); signOut({ callbackUrl: "/signin" }); }}
        title="Sign out"
        className="rounded-md border px-2 py-1.5 text-[10px] uppercase tracking-[0.12em]"
        style={{ borderColor: "var(--cave-line)", color: "var(--cave-dim)" }}
      >
        ⏻ Sign out
      </button>
    </div>
  );
}
