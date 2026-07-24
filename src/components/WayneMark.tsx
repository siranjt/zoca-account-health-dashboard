// Wayne-style W-shield emblem, hand-drawn as SVG (original geometry in the
// heraldic W-shield style — not the trademark asset). Shown in the light
// "Bruce Wayne" persona; the bat emblem carries the dark "Batman" persona.
// Colour follows `currentColor` so it inherits the theme accent.

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
