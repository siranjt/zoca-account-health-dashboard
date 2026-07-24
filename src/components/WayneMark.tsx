// Wayne-style W-shield emblem, hand-drawn as SVG (original geometry in the
// heraldic W-shield style — not the trademark asset). Shown in the light
// "Bruce Wayne" persona; the bat emblem carries the dark "Batman" persona.
// Colour follows `currentColor` so it inherits the theme accent.

// Sleek modern bat silhouette (original path) — the dark "Batman" persona mark:
// swept wings tapering to points, scalloped lower edges, twin ears with a notch.
export const BAT_PATH =
  "M50 7 C51 4.5 52 3 53.5 3 C54.5 4 55 6.5 56 8.5 C58 11 61 12 64 11.2 C74 9 84 8.5 93 10.5 C90 15 87 18 84 21 C81 24 79 27 76.5 30.5 C74 28 72 26 70 27 C67 31 63 35 59 36.5 C56 37.5 53 38.5 50 41 C47 38.5 44 37.5 41 36.5 C37 35 33 31 30 27 C28 26 26 28 23.5 30.5 C21 27 19 24 16 21 C13 18 10 15 7 10.5 C16 8.5 26 9 36 11.2 C39 12 42 11 44 8.5 C45 6.5 45.5 4 46.5 3 C48 3 49 4.5 50 7 Z";

export function BatShield({ size = 34, className = "", fill = "currentColor" }: { size?: number; className?: string; fill?: string }) {
  return (
    <svg viewBox="0 0 100 44" width={size} height={(size * 44) / 100} className={className} aria-hidden="true">
      <path fill={fill} d={BAT_PATH} />
    </svg>
  );
}

export function WayneShield({ size = 30, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 108" width={size} height={(size * 108) / 100} className={className} aria-hidden="true" fill="none">
      {/* shield outline */}
      <path d="M14 15 H86 V60 C86 77 68 90 50 100 C32 90 14 77 14 60 Z" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinejoin="round" />
      {/* bold angular W */}
      <polyline points="27,27 42,72 50,49 58,72 73,27" fill="none" stroke="currentColor" strokeWidth="11" strokeLinejoin="miter" strokeLinecap="butt" />
    </svg>
  );
}

// Full lockup: flanking bars + shield + "WAYNE ENTERPRISES" wordmark.
export default function WayneMark({
  size = 30,
  wordmark = true,
  bars = true,
  className = "",
}: {
  size?: number;
  wordmark?: boolean;
  bars?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex flex-col items-center ${className}`} style={{ color: "currentColor" }}>
      <span className="inline-flex items-center gap-2">
        {bars && <span aria-hidden="true" className="block rounded-full" style={{ width: size * 0.9, height: 3, background: "currentColor" }} />}
        <WayneShield size={size} />
        {bars && <span aria-hidden="true" className="block rounded-full" style={{ width: size * 0.9, height: 3, background: "currentColor" }} />}
      </span>
      {wordmark && (
        <span className="mt-1 flex flex-col items-center leading-none">
          <span className="font-black tracking-[0.16em]" style={{ fontSize: size * 0.5 }}>WAYNE</span>
          <span className="mt-[3px] font-semibold tracking-[0.4em]" style={{ fontSize: size * 0.22, opacity: 0.75 }}>ENTERPRISES</span>
        </span>
      )}
    </span>
  );
}
