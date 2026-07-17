#!/usr/bin/env node
// Alfred golden-eval runner. Fires each case at a deployed /api/ask and checks
// the reply contains the expected substrings (and none of the forbidden ones).
// Usage: node scripts/eval.mjs [baseUrl]
//   baseUrl defaults to the production Vercel URL; override for a preview.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || process.env.ALFRED_BASE || "https://zoca-account-health-dashboard.vercel.app";
const cases = JSON.parse(readFileSync(join(__dir, "..", "evals", "golden.json"), "utf8"));

async function ask(q) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/api/ask`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q }),
  });
  const j = await r.json().catch(() => ({}));
  return { reply: String(j.reply || j.error || ""), ms: Date.now() - t0 };
}

let pass = 0, totalMs = 0;
const fails = [];
console.log(`\nAlfred golden evals → ${BASE}\n${"=".repeat(60)}`);
for (const c of cases) {
  const { reply, ms } = await ask(c.q);
  totalMs += ms;
  const lc = reply.toLowerCase();
  const missing = (c.expect || []).filter((e) => !lc.includes(e.toLowerCase()));
  const forbidden = (c.notExpect || []).filter((e) => lc.includes(e.toLowerCase()));
  const ok = missing.length === 0 && forbidden.length === 0;
  if (ok) pass++;
  else fails.push({ id: c.id, missing, forbidden, snippet: reply.slice(0, 120).replace(/\n/g, " ") });
  console.log(`${ok ? "✓" : "✗"}  ${c.id.padEnd(18)} ${(ms / 1000).toFixed(1)}s${ok ? "" : "  <-- FAIL"}`);
}
console.log("=".repeat(60));
console.log(`PASS ${pass}/${cases.length}  ·  avg ${(totalMs / cases.length / 1000).toFixed(1)}s/case`);
if (fails.length) {
  console.log("\nFailures:");
  for (const f of fails) {
    if (f.missing.length) console.log(`  ✗ ${f.id}: missing ${JSON.stringify(f.missing)}`);
    if (f.forbidden.length) console.log(`  ✗ ${f.id}: forbidden present ${JSON.stringify(f.forbidden)}`);
    console.log(`      reply: "${f.snippet}…"`);
  }
}
