import "server-only";

// Minimal transactional email via Resend's HTTP API — no SDK dependency, just
// fetch. No-op (returns not-ok) when RESEND_API_KEY / DIGEST_FROM are unset, so
// the app degrades gracefully like every other integration.

export function mailerConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.DIGEST_FROM;
}

export async function sendEmail(opts: { to: string; subject: string; html: string; replyTo?: string }): Promise<{ ok: boolean; id?: string; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.DIGEST_FROM;
  if (!key || !from) return { ok: false, error: "mailer not configured (RESEND_API_KEY / DIGEST_FROM)" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: opts.to, subject: opts.subject, html: opts.html, reply_to: opts.replyTo }),
    });
    const j = (await r.json().catch(() => ({}))) as { id?: string };
    if (!r.ok) return { ok: false, error: `resend ${r.status}: ${JSON.stringify(j).slice(0, 200)}` };
    return { ok: true, id: j.id };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) };
  }
}
