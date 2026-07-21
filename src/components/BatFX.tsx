"use client";

import { useEffect } from "react";

// Ambient bat-computer effects: a one-time power-on boot overlay + a cyan
// click-ripple. Purely decorative (fixed, pointer-events:none) — no layout or
// behavior impact. Honors prefers-reduced-motion.
export default function BatFX() {
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) return;

    function onDown(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      // skip ripple on text inputs so it doesn't distract while typing
      if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
      const r = document.createElement("div");
      r.className = "cave-ripple";
      r.style.left = e.clientX + "px";
      r.style.top = e.clientY + "px";
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 620);
    }
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, []);

  return <div className="cave-crt" aria-hidden="true" />;
}
