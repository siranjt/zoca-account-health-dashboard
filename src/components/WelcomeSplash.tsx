"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/track";
import { BAT_PATH, WayneShield } from "./WayneMark";

// A one-time, cinematic "Welcome, <first name>" splash shown right after sign-in.
// Reads the session, derives the person's first name (Google display name →
// their AM/roster name → email), decodes it in over the bat emblem, then fades
// out. Shown once per browser session per user so it doesn't repeat on nav.
// Optional per-email greeting overrides (none by default — use the SSO name).
const NAME_OVERRIDES: Record<string, string> = {};

function firstName(u: { name?: string; amName?: string; email?: string }): string {
  const override = NAME_OVERRIDES[(u.email || "").toLowerCase()];
  if (override) return override;
  const raw = (u.name || u.amName || (u.email || "").split("@")[0] || "there").trim();
  const first = raw.split(/[ ._-]+/)[0] || "there";
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export default function WelcomeSplash() {
  const [name, setName] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const nameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!s || !s.user || !s.user.role) return;
        const key = "cave_welcomed_" + (s.user.email || "x");
        try {
          if (sessionStorage.getItem(key)) return;
          sessionStorage.setItem(key, "1");
        } catch { /* ignore */ }
        track("sign_in");
        setName(firstName(s.user));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!name) return;
    const el = nameRef.current;
    if (el) {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
      let f = 0;
      const id = setInterval(() => {
        f++;
        el.textContent = name
          .split("")
          .map((c, i) => (i < f / 2 || c === " " ? c : chars[Math.floor(Math.random() * chars.length)]))
          .join("");
        if (f / 2 >= name.length) { el.textContent = name; clearInterval(id); }
      }, 55);
    }
    const t1 = setTimeout(() => setClosing(true), 2700);
    const t2 = setTimeout(() => setName(null), 3400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [name]);

  if (!name) return null;

  // Match the active persona: Bruce Wayne (light) → warm ivory + gold + W-shield;
  // Batman (dark) → deep night + cyan + bat.
  const light = typeof document !== "undefined" && document.documentElement.classList.contains("light");
  const P = light
    ? {
        bg: "radial-gradient(900px 500px at 50% 45%, rgba(184,134,43,.16), transparent 60%), rgba(245,241,233,.96)",
        sweep: "linear-gradient(rgba(184,134,43,0),rgba(184,134,43,.08) 50%,rgba(184,134,43,0))",
        breathe: "ws-breathe-gold",
        eyebrow: "#8a7a55", eyebrowText: "Welcome · Wayne Enterprises",
        name: "#8a6416", nameShadow: "0 0 22px rgba(184,134,43,.5)",
        sub: "#9a865a", subText: "At your service, sir",
        serif: 'Georgia, "Times New Roman", serif',
      }
    : {
        bg: "radial-gradient(900px 500px at 50% 45%, rgba(53,224,255,.10), transparent 60%), rgba(4,8,10,.94)",
        sweep: "linear-gradient(rgba(53,224,255,0),rgba(53,224,255,.06) 50%,rgba(53,224,255,0))",
        breathe: "ws-breathe",
        eyebrow: "#6f8b91", eyebrowText: "Welcome to CAVE//OS",
        name: "#8ff0ff", nameShadow: "0 0 26px rgba(53,224,255,.6)",
        sub: "#4e6a70", subText: "Access granted",
        serif: 'ui-monospace,"SF Mono",monospace',
      };

  return (
    <div
      onClick={() => setName(null)}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483600,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        cursor: "pointer",
        background: P.bg,
        backdropFilter: "blur(3px)",
        opacity: closing ? 0 : 1,
        transition: "opacity .7s ease",
      }}
    >
      <style>{
        "@keyframes ws-breathe{0%,100%{filter:drop-shadow(0 0 14px rgba(53,224,255,.45))}50%{filter:drop-shadow(0 0 34px rgba(53,224,255,.9))}}" +
        "@keyframes ws-breathe-gold{0%,100%{filter:drop-shadow(0 0 14px rgba(184,134,43,.45))}50%{filter:drop-shadow(0 0 34px rgba(214,170,90,.95))}}" +
        "@keyframes ws-sweep{0%{transform:translateY(-40vh)}100%{transform:translateY(60vh)}}" +
        "@keyframes ws-rise{0%{opacity:0;transform:translateY(12px)}100%{opacity:1;transform:none}}"
      }</style>
      <div style={{ position: "absolute", left: 0, right: 0, height: 160, pointerEvents: "none", background: P.sweep, animation: "ws-sweep 2.4s linear infinite" }} />
      {light ? (
        <span style={{ color: "#b0842b", display: "inline-flex", animation: `${P.breathe} 2.6s ease-in-out infinite` }}>
          <WayneShield size={64} />
        </span>
      ) : (
        <svg viewBox="0 0 100 44" width="120" height="53" style={{ animation: `${P.breathe} 2.6s ease-in-out infinite` }} aria-hidden="true">
          <path fill="#35e0ff" d={BAT_PATH} />
        </svg>
      )}
      <div style={{ fontFamily: P.serif, fontSize: 12, letterSpacing: "0.42em", textTransform: "uppercase", color: P.eyebrow, animation: "ws-rise .6s .1s both" }}>
        {P.eyebrowText}
      </div>
      <div
        ref={nameRef}
        style={{
          fontFamily: P.serif,
          fontSize: "clamp(2rem, 7vw, 4rem)",
          fontWeight: 700,
          color: P.name,
          textShadow: P.nameShadow,
          letterSpacing: "0.04em",
        }}
      >
        {name}
      </div>
      <div style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: P.sub, fontFamily: P.serif, animation: "ws-rise .6s .3s both" }}>
        {P.subText}
      </div>
    </div>
  );
}
