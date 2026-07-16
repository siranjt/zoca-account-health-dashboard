// Validated data-viz palette (light surface) from the dataviz skill.
// Categorical order is the CVD-safe order; do not reorder.
export const VIZ = {
  surface: "#fcfcfb",
  ink: "#0b0b0b",
  ink2: "#52514e",
  muted: "#898781",
  grid: "#e1e0d9",
  baseline: "#c3c2b7",
  series: ["#2a78d6", "#008300", "#e87ba4", "#eda100", "#1baf7a", "#eb6834", "#4a3aa7", "#e34948"],
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
  deltaUp: "#006300",
  deltaDown: "#d03b3b",
};

/** score 0-100 -> status color */
export function scoreColor(v: number | null): string {
  if (v == null) return VIZ.muted;
  if (v >= 75) return VIZ.good;
  if (v >= 50) return VIZ.warning;
  if (v >= 30) return VIZ.serious;
  return VIZ.critical;
}
