"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { signOut } from "next-auth/react";
import { track } from "@/lib/track";

type U = { name?: string; email?: string; role?: string; amName?: string };

// The nav "menu" — collapses the account, admin links, display toggles and
// sign-out into one dropdown so the top bar stays light. The theme toggle stays
// outside (in CaveNav); the display toggles (rain/detective/calm) come in as
// children. Renders nothing when SSO is off and there are no children.
export default function UserMenu({ children }: { children?: ReactNode }) {
  const [u, setU] = useState<U | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (s && s.user && (s.user.email || s.user.name)) setU(s.user); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, [open]);

  // No session yet: still surface the display toggles so they're never lost.
  if (!u) return children ? <div className="flex items-center gap-1.5">{children}</div> : null;

  const roleLabel =
    u.role === "admin" ? "Admin" :
    u.role === "manager" ? "Manager" :
    u.role === "am" ? `AM · ${u.amName || "—"}` :
    "no role — check ACCESS_CONTROL";
  const first = (u.name || u.email || "").split(" ")[0];
  // Impact / Activity / Alfred are open to admins plus a small allow-list of
  // non-admins (mirrors canUseAdminTools + ADMIN_TOOL_EMAILS in lib/scope.ts,
  // inlined here because that module is server-only). AM Report + Archives stay
  // strictly admin. The server routes enforce this too — this is nav visibility.
  const canTools = u.role === "admin" || (u.email || "").trim().toLowerCase() === "robin@zoca.com";

  const item = "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs no-underline transition-colors hover:bg-white/[0.06]";
  const itemStyle = { color: "var(--cave-dim)" };
  const rule = <div className="my-1 border-t" style={{ borderColor: "var(--cave-line)" }} />;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Menu"
        className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px]"
        style={{ borderColor: "var(--cave-line)", color: "var(--cave-dim)" }}
      >
        <span aria-hidden>☰</span>
        <span className="hidden max-w-[90px] truncate sm:inline">{first}</span>
      </button>

      {open && (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className="absolute right-0 z-50 mt-2 w-56 rounded-lg border p-1.5 shadow-2xl"
          style={{ borderColor: "var(--cave-line2)", background: "var(--cave-panel)", backdropFilter: "blur(10px)" }}
        >
          <div className="px-2 py-1.5 text-[11px]" style={{ color: "var(--cave-dim)" }} title={u.email}>
            {first} <span style={{ color: "var(--cave-cy)" }}>· {roleLabel}</span>
          </div>

          {rule}
          <a href="/training.html" target="_blank" rel="noopener noreferrer" className={item} style={itemStyle}>🎓 Training</a>

          {canTools && (
            <>
              {rule}
              <a href="/admin/impact" className={item} style={itemStyle}>📈 Impact</a>
              <a href="/admin/activity" className={item} style={itemStyle}>📋 Activity</a>
              <a href="/admin/alfred" className={item} style={itemStyle}>🤖 Alfred</a>
            </>
          )}
          {u.role === "admin" && (
            <>
              {rule}
              <a href="/am-report" className={item} style={itemStyle} title="AM daily report — snapshot trend (owner only)">📒 AM Report</a>
              <a href="/admin/archives" className={item} style={itemStyle}>🗄️ Archives</a>
            </>
          )}
          {(u.role === "admin" || u.role === "manager" || u.role === "am") && (
            <>
              {u.role !== "admin" && rule}
              <a href="/admin/lead-droughts" className={item} style={itemStyle}>🦇 Bat-Signal</a>
              <a href="/admin/void" className={item} style={itemStyle}>🃏 Rogues</a>
            </>
          )}

          {children && (
            <>
              {rule}
              <div className="px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]" style={{ color: "var(--cave-dim)" }}>Display</div>
              <div className="flex flex-wrap gap-1.5 px-1.5 py-1" onClick={(e) => e.stopPropagation()}>{children}</div>
            </>
          )}

          {rule}
          <button
            onClick={() => { track("sign_out"); signOut({ callbackUrl: "/signin" }); }}
            className={item}
            style={itemStyle}
          >
            ⏻ Sign out
          </button>
        </div>
      )}
    </div>
  );
}
