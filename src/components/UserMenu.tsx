"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

type U = { name?: string; email?: string; role?: string; amName?: string };

// Shows who's signed in + their role + a sign-out button. Renders nothing when
// SSO is off (no session), so the nav is unchanged until Google login is live.
export default function UserMenu() {
  const [u, setU] = useState<U | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (s && s.user && s.user.role) setU(s.user); })
      .catch(() => {});
  }, []);

  if (!u) return null;

  const roleLabel =
    u.role === "admin" ? "Admin" :
    u.role === "manager" ? "Manager" :
    u.role === "am" ? `AM · ${u.amName || "—"}` : "";
  const first = (u.name || u.email || "").split(" ")[0];

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-[11px] sm:inline" title={u.email} style={{ color: "var(--cave-dim)" }}>
        {first} <span style={{ color: "var(--cave-cy)" }}>· {roleLabel}</span>
      </span>
      <button
        onClick={() => signOut({ callbackUrl: "/signin" })}
        title="Sign out"
        className="rounded-md border px-2 py-1.5 text-[10px] uppercase tracking-[0.12em]"
        style={{ borderColor: "var(--cave-line)", color: "var(--cave-dim)" }}
      >
        ⏻ Sign out
      </button>
    </div>
  );
}
