import { signIn } from "@/auth";
import { ssoConfigured } from "@/lib/access";
import { redirect } from "next/navigation";
import SignInCard from "@/components/SignInCard";

export const dynamic = "force-dynamic";

// The CAVE//OS sign-in gate. Google-only, restricted to the roster. The visible
// card (theme-aware + theme switcher) is a client component; the Google sign-in
// server action is defined here and passed in.
export default async function SignIn({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  if (!ssoConfigured()) redirect("/");
  const sp = await searchParams;
  const callbackUrl = sp.callbackUrl || "/";

  async function doSignIn() {
    "use server";
    await signIn("google", { redirectTo: callbackUrl });
  }

  return <SignInCard signInAction={doSignIn} error={sp.error} />;
}
