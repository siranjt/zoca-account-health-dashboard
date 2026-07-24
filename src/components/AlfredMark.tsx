/* eslint-disable @next/next/no-img-element */

// Alfred's crest — the gold butler emblem. `emblem` (default) is the oval
// medallion for small icon spots; `full` is the complete ALFRED lockup.
// The art has a black ground, so on light surfaces we frame it as a medallion
// so it reads deliberately in both personas.
export default function AlfredMark({
  size = 22,
  full = false,
  framed = false,
  className = "",
}: {
  size?: number;
  full?: boolean;
  framed?: boolean;
  className?: string;
}) {
  if (full) {
    return <img src="/alfred/alfred-logo.png" alt="Alfred" width={size} height={size} className={className} style={{ display: "block", objectFit: "contain" }} />;
  }
  const h = size;
  const w = Math.round((size * 660) / 810); // emblem aspect (660×810)
  const img = <img src="/alfred/alfred-emblem.png" alt="Alfred" width={w} height={h} style={{ display: "block", objectFit: "contain" }} />;
  if (!framed) return <span className={className} style={{ display: "inline-flex" }}>{img}</span>;
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b0b0d",
        borderRadius: 6,
        padding: 2,
        border: "1px solid rgba(184,134,43,.45)",
        boxShadow: "0 0 8px rgba(184,134,43,.25)",
        overflow: "hidden",
        lineHeight: 0,
      }}
    >
      {img}
    </span>
  );
}
