import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { identityFor } from "@/lib/access";

// Auth.js (NextAuth v5) — Google sign-in restricted to the ACCESS_CONTROL
// roster. Role + (for AMs) their book name ride the JWT into the session so
// server components and the middleware can scope data per person.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  // A dummy fallback keeps NextAuth from throwing before SSO is configured;
  // it's never used for a real session because Google creds are also required.
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "cave-sso-not-yet-configured",
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  callbacks: {
    // Allowlist: only emails on the roster may sign in.
    async signIn({ user }) {
      return identityFor(user.email) !== null;
    },
    async jwt({ token }) {
      const id = identityFor(token.email);
      if (id) {
        token.role = id.role;
        token.amName = id.amName;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = (token.role as unknown as "admin" | "manager" | "am" | null | undefined) ?? null;
        session.user.amName = (token.amName as unknown as string | null | undefined) ?? null;
      }
      return session;
    },
  },
});
