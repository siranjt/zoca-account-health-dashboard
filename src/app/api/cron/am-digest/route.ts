import { NextResponse } from "next/server";
import { buildAmDigests, renderDigestEmail } from "@/lib/digest";
import { sendEmail, mailerConfigured } from "@/lib/mailer";
import { logActivity } from "@/lib/activity";

// Scheduled per-AM "your book needs attention" digest. CRON_SECRET-gated.
// ?dry=1 builds + renders but does NOT send — for verifying targeting.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authz = req.headers.get("authorization");
    if (authz !== `Bearer ${secret}`) return new NextResponse("unauthorized", { status: 401 });
  }

  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const digests = await buildAmDigests(3);

  if (dry) {
    return NextResponse.json({
      ok: true, dry: true, mailerConfigured: mailerConfigured(), candidates: digests.length,
      preview: digests.map((d) => ({ to: d.email, am: d.amName, subject: renderDigestEmail(d).subject, totalAtRisk: d.totalAtRisk, accounts: d.accounts.map((a) => `${a.name} — ${a.driver}`) })),
    });
  }

  let sent = 0, failed = 0;
  const results: Array<{ email: string; ok: boolean; accounts: number; error?: string }> = [];
  for (const d of digests) {
    const { subject, html } = renderDigestEmail(d);
    const r = await sendEmail({ to: d.email, subject, html });
    if (r.ok) {
      sent++;
      await logActivity(
        { email: d.email, name: d.amName, role: "am", amName: d.amName },
        { event: "digest_sent", surface: "am_digest", detail: { accounts: d.accounts.length, atRisk: d.totalAtRisk } },
      );
    } else {
      failed++;
    }
    results.push({ email: d.email, ok: r.ok, accounts: d.accounts.length, error: r.error });
  }

  return NextResponse.json({ ok: true, mailerConfigured: mailerConfigured(), candidates: digests.length, sent, failed, results });
}
