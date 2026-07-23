import { signIn } from "@/auth";
import { ssoConfigured } from "@/lib/access";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The CAVE//OS sign-in gate. Google-only, restricted to the roster.
export default async function SignIn({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  // If SSO isn't configured, there's nothing to sign in to — send them home.
  if (!ssoConfigured()) redirect("/");
  const sp = await searchParams;
  const callbackUrl = sp.callbackUrl || "/";
  const error = sp.error;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(1100px 620px at 84% -12%, rgba(53,224,255,.08), transparent 60%), #04080a",
        color: "#dbe9ec",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div
        style={{
          width: "min(420px, 92vw)",
          border: "1px solid #1c4d59",
          borderRadius: 16,
          background: "linear-gradient(180deg,#0a1418,#04080a)",
          padding: "40px 34px",
          textAlign: "center",
          boxShadow: "0 24px 80px rgba(0,0,0,.6)",
        }}
      >
        <svg viewBox="0 0 100 44" width="78" height="34" style={{ filter: "drop-shadow(0 0 16px rgba(53,224,255,.6))", marginBottom: 14 }}>
          <path fill="#35e0ff" d="M50 3 C48 11 45 14 41 12 C43 16 42 19 39 20 C33 15 25 16 20 23 C26 21 30 23 31 27 C25 28 20 32 18 39 C24 34 33 33 37 37 C40 30 45 28 50 33 C55 28 60 30 63 37 C67 33 76 34 82 39 C80 32 75 28 69 27 C70 23 74 21 80 23 C75 16 67 15 61 20 C58 19 57 16 59 12 C55 14 52 11 50 3 Z" />
        </svg>
        <div style={{ fontFamily: "ui-monospace, monospace", letterSpacing: "0.3em", color: "#35e0ff", fontWeight: 700, fontSize: 18, textShadow: "0 0 14px rgba(53,224,255,.4)" }}>
          CAVE//OS
        </div>
        <div style={{ fontSize: 12, color: "#6f8b91", letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 6 }}>
          Account Health Command Deck
        </div>
        <p style={{ color: "#a7c3c8", fontSize: 14, margin: "22px 0 18px" }}>
          Sign in with your Zoca Google account to continue.
        </p>

        {error && (
          <div style={{ color: "#ff6b6b", fontSize: 13, marginBottom: 14, border: "1px solid rgba(255,107,107,.4)", background: "rgba(255,107,107,.08)", borderRadius: 8, padding: "8px 12px" }}>
            {error === "AccessDenied"
              ? "That account isn't on the access list. Contact an admin."
              : "Sign-in failed. Please try again."}
          </div>
        )}

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: callbackUrl });
          }}
        >
          <button
            type="submit"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              justifyContent: "center",
              padding: "12px 18px",
              borderRadius: 10,
              border: 0,
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 14,
              color: "#03181e",
              background: "linear-gradient(180deg,#8ff0ff,#1899b4)",
              boxShadow: "0 8px 26px rgba(0,0,0,.4), 0 0 18px rgba(53,224,255,.28)",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#fff" d="M44.5 20H24v8.5h11.8C34.7 33.9 30 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z" />
            </svg>
            Sign in with Google
          </button>
        </form>

        <div style={{ fontSize: 11, color: "#6f8b91", marginTop: 18 }}>
          Access is restricted. If you should have access, contact your admin.
        </div>
      </div>
    </main>
  );
}
