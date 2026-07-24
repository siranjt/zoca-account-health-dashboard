"use client";

import { useEffect, useRef, useState } from "react";

// A one-time, cinematic "Welcome, <first name>" splash shown right after sign-in.
// Reads the session, derives the person's first name (Google display name →
// their AM/roster name → email), decodes it in over the bat emblem, then fades
// out. Shown once per browser session per user so it doesn't repeat on nav.
// Preferred greeting names that don't fall out of the email/display name.
const NAME_OVERRIDES: Record<string, string> = {
  "siranjith.t@zoca.com": "Siranj",
  "siranjith.t@gmail.com": "Siranj",
};

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
        background: "radial-gradient(900px 500px at 50% 45%, rgba(53,224,255,.10), transparent 60%), rgba(4,8,10,.94)",
        backdropFilter: "blur(3px)",
        opacity: closing ? 0 : 1,
        transition: "opacity .7s ease",
      }}
    >
      <style>{
        "@keyframes ws-breathe{0%,100%{filter:drop-shadow(0 0 14px rgba(53,224,255,.45))}50%{filter:drop-shadow(0 0 34px rgba(53,224,255,.9))}}" +
        "@keyframes ws-sweep{0%{transform:translateY(-40vh)}100%{transform:translateY(60vh)}}" +
        "@keyframes ws-rise{0%{opacity:0;transform:translateY(12px)}100%{opacity:1;transform:none}}"
      }</style>
      <div style={{ position: "absolute", left: 0, right: 0, height: 160, pointerEvents: "none",
        background: "linear-gradient(rgba(53,224,255,0),rgba(53,224,255,.06) 50%,rgba(53,224,255,0))", animation: "ws-sweep 2.4s linear infinite" }} />
      <svg viewBox="0 0 100 44" width="120" height="53" style={{ animation: "ws-breathe 2.6s ease-in-out infinite" }} aria-hidden="true">
        <path fill="#35e0ff" d="M50 3 C48 11 45 14 41 12 C43 16 42 19 39 20 C33 15 25 16 20 23 C26 21 30 23 31 27 C25 28 20 32 18 39 C24 34 33 33 37 37 C40 30 45 28 50 33 C55 28 60 30 63 37 C67 33 76 34 82 39 C80 32 75 28 69 27 C70 23 74 21 80 23 C75 16 67 15 61 20 C58 19 57 16 59 12 C55 14 52 11 50 3 Z" />
      </svg>
      <div style={{ fontFamily: "ui-monospace,\"SF Mono\",monospace", fontSize: 12, letterSpacing: "0.42em", textTransform: "uppercase", color: "#6f8b91", animation: "ws-rise .6s .1s both" }}>
        Welcome to CAVE//OS
      </div>
      <div
        ref={nameRef}
        style={{
          fontFamily: "ui-monospace,\"SF Mono\",monospace",
          fontSize: "clamp(2rem, 7vw, 4rem)",
          fontWeight: 700,
          color: "#8ff0ff",
          textShadow: "0 0 26px rgba(53,224,255,.6)",
          letterSpacing: "0.04em",
        }}
      >
        {name}
      </div>
      <div style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#4e6a70", fontFamily: "ui-monospace,monospace", animation: "ws-rise .6s .3s both" }}>
        Access granted
      </div>
    </div>
  );
}
