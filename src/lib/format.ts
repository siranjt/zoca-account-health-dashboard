// ===========================================================================
// Small display helpers.
// ===========================================================================

export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 0) return "—";
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return remMins ? `${hours}h ${remMins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days}d ${remHours}h` : `${days}d`;
}

export function formatNumber(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}

export function formatPercent(n: number | null, digits = 1): string {
  if (n == null) return "—";
  return `${n.toFixed(digits)}%`;
}

export function formatRank(n: number | null): string {
  if (n == null) return "—";
  return n.toFixed(1);
}

export function formatDays(n: number | null): string {
  if (n == null) return "—";
  return `${n}d`;
}

export function formatTenure(days: number | null): string {
  if (days == null) return "—";
  if (days < 60) return `${days}d`;
  const months = Math.round(days / 30);
  if (months < 24) return `${months} mo`;
  return `${(days / 365).toFixed(1)} yr`;
}

/** short "Jul 9" style for range labels */
export function formatShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
