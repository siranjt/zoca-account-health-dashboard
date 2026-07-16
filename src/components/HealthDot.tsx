import type { HealthScore } from "@/lib/types";
import { TIER_LABEL } from "@/lib/health";

const COLOR: Record<string, string> = {
  green: "#16a34a",
  yellow: "#d97706",
  red: "#dc2626",
};

export default function HealthDot({ health }: { health: HealthScore }) {
  const composite = health.composite != null ? health.composite.toFixed(1) : "—";
  const title =
    `${TIER_LABEL[health.tier]} · composite ${composite}` +
    (health.reason ? ` · watch: ${health.reason}` : "") +
    `\nEngagement ${fmt(health.engagement)} · Value ${fmt(health.value)} · Product ${fmt(
      health.product
    )}`;
  return (
    <span className="inline-flex items-center" title={title}>
      <span
        className="inline-block h-3 w-3 rounded-full ring-2 ring-white"
        style={{ background: COLOR[health.color], boxShadow: "0 0 0 1px rgba(0,0,0,0.08)" }}
        aria-label={TIER_LABEL[health.tier]}
      />
    </span>
  );
}

function fmt(n: number | null): string {
  return n == null ? "—" : n.toFixed(0);
}
