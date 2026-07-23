import type { DefaultSession } from "next-auth";

type CaveRole = "admin" | "manager" | "am";

declare module "next-auth" {
  interface Session {
    user: {
      role?: CaveRole | null;
      amName?: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: CaveRole | null;
    amName?: string | null;
  }
}
