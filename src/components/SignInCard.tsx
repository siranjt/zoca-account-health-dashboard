"use client";

import { useEffect, useState } from "react";
import { BatShield, WayneShield } from "./WayneMark";

// Theme-aware sign-in card. Dark = Batman (new bat mark), light = Bruce Wayne
// (W-shield). Carries its own theme switcher so the auth page matches the app.
// The Google sign-in server action is passed in from the (server) page.
export default function SignInCard({ signInAction, error }: { signInAction: () => Promise<void>; error?: string }) {
  const [light, setLight] = useState(false);

  useEffect(() => {
    let l = false;
    try { l = localStorage.getItem("cave-theme") === "light"; } catch { /* ignore */ }
    setLight(l);
    document.documentElement.classList.toggle("light", l);
  }, []);

  function toggleTheme() {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle("light", next);
    try { localStorage.setItem("cave-theme", next ? "light" : "dark"); } catch { /* ignore */ }
  }

  const P = light
    ? {
        bg: "radial-gradient(1100px 620px at 84% -12%, rgba(184,134,11,.12), transparent 60%), #eef1f5",
        panel: "linear-gradient(180deg,#ffffff,#f3f5f8)",
        border: "#d7dde3",
        accent: "#b8860b",
        accentGlow: "rgba(184,134,11,.35)",
        text: "#17242b",
        dim: "#5b6b72",
        errText: "#b91c1c",
        btnBg: "linear-gradient(180deg,#22333c,#101b21)",
        btnText: "#f4efe2",
      }
    : {
        bg: "radial-gradient(1100px 620px at 84% -12%, rgba(53,224,255,.08), transparent 60%), #04080a",
        panel: "linear-gradient(180deg,#0a1418,#04080a)",
        border: "#1c4d59",
        accent: "#35e0ff",
        accentGlow: "rgba(53,224,255,.4)",
        text: "#dbe9ec",
        dim: "#6f8b91",
        errText: "#ff6b6b",
        btnBg: "linear-gradient(180deg,#8ff0ff,#1899b4)",
        btnText: "#03181e",
      };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: P.bg,
        color: P.text,
        fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        transition: "background .35s ease, color .35s ease",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "min(420px, 92vw)",
          border: `1px solid ${P.border}`,
          borderRadius: 16,
          background: P.panel,
          padding: "40px 34px",
          textAlign: "center",
          boxShadow: light ? "0 24px 80px rgba(30,45,60,.18)" : "0 24px 80px rgba(0,0,0,.6)",
          transition: "background .35s ease, border-color .35s ease",
        }}
      >
        {/* theme switcher */}
        <button
          onClick={toggleTheme}
          title={light ? "Switch to Batman (dark)" : "Switch to Wayne (light)"}
          style={{
            position: "absolute", top: 12, right: 12, cursor: "pointer",
            border: `1px solid ${P.border}`, background: "transparent", color: P.dim,
            borderRadius: 8, padding: "5px 8px", fontSize: 13, lineHeight: 1,
          }}
        >
          {light ? "🌙" : "☀️"}
        </button>

        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14, color: P.accent, filter: `drop-shadow(0 0 16px ${P.accentGlow})` }}>
          {light ? <WayneShield size={40} /> : <BatShield size={82} />}
        </div>

        <div style={{ fontFamily: "ui-monospace, monospace", letterSpacing: "0.3em", color: P.accent, fontWeight: 700, fontSize: 18, textShadow: `0 0 14px ${P.accentGlow}` }}>
          CAVE//OS
        </div>
        <div style={{ fontSize: 12, color: P.dim, letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 6 }}>
          {light ? "Wayne Enterprises · Account Portfolio" : "Account Health Command Deck"}
        </div>
        <p style={{ color: light ? "#3c4d55" : "#a7c3c8", fontSize: 14, margin: "22px 0 18px" }}>
          Sign in with your Zoca Google account to continue.
        </p>

        {error && (
          <div style={{ color: P.errText, fontSize: 13, marginBottom: 14, border: `1px solid ${P.errText}55`, background: `${P.errText}14`, borderRadius: 8, padding: "8px 12px" }}>
            {error === "AccessDenied" ? "That account isn't on the access list. Contact an admin." : "Sign-in failed. Please try again."}
          </div>
        )}

        <form action={signInAction}>
          <button
            type="submit"
            style={{
              display: "inline-flex", alignItems: "center", gap: 10, width: "100%", justifyContent: "center",
              padding: "12px 18px", borderRadius: 10, border: 0, cursor: "pointer", fontWeight: 700, fontSize: 14,
              color: P.btnText, background: P.btnBg,
              boxShadow: light ? "0 8px 22px rgba(30,45,60,.22)" : "0 8px 26px rgba(0,0,0,.4), 0 0 18px rgba(53,224,255,.28)",
            }}
          >
            <span style={{ display: "inline-flex", background: "#fff", borderRadius: 4, padding: 2 }}>
              <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.9 7.2l7.6 5.9c4.4-4.1 7.1-10.1 7.1-17.6z" />
                <path fill="#FBBC05" d="M10.4 28.3a14.5 14.5 0 0 1 0-8.6l-7.8-6.1a24 24 0 0 0 0 20.8l7.8-6.1z" />
                <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.6-5.9c-2.1 1.4-4.8 2.3-7.6 2.3-6.3 0-11.7-3.7-13.6-9.1l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
              </svg>
            </span>
            Sign in with Google
          </button>
        </form>

        <div style={{ fontSize: 11, color: P.dim, marginTop: 18 }}>
          Access is restricted. If you should have access, contact your admin.
        </div>
      </div>
    </main>
  );
}
