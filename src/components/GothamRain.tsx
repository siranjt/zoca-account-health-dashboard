"use client";

import { useEffect, useRef } from "react";

// Gotham Rain — an ambient storm over the Batcave ground: diagonal rain streaks
// on a fixed canvas plus the odd distant lightning flash (CSS). Decorative,
// pointer-events:none, additive. Batman-side only — hidden in light (Wayne's
// penthouse is clear) and in calm mode (see globals.css). Redraws via rAF.
export default function GothamRain() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let raf = 0, w = 0, h = 0;
    const N = 130;
    type Drop = { x: number; y: number; len: number; vy: number; a: number };
    let drops: Drop[] = [];
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    function seed() {
      drops = Array.from({ length: N }, () => ({ x: Math.random() * w, y: Math.random() * h, len: rand(9, 22), vy: rand(7, 14), a: rand(0.06, 0.22) }));
    }
    function resize() { w = cv!.width = window.innerWidth; h = cv!.height = window.innerHeight; seed(); }
    resize();
    window.addEventListener("resize", resize);
    const slant = 1.6; // diagonal drift (Gotham wind)
    function frame() {
      ctx!.clearRect(0, 0, w, h);
      ctx!.lineCap = "round";
      for (const d of drops) {
        d.y += d.vy;
        d.x += slant;
        if (d.y - d.len > h) { d.y = rand(-40, -4); d.x = Math.random() * w; }
        if (d.x > w) d.x = -4;
        ctx!.strokeStyle = `rgba(150,205,255,${d.a})`;
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.moveTo(d.x, d.y);
        ctx!.lineTo(d.x - slant * (d.len / d.vy) * 3, d.y - d.len);
        ctx!.stroke();
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return (
    <>
      <canvas ref={ref} className="gotham-rain" aria-hidden="true" />
      <div className="gotham-lightning" aria-hidden="true" />
    </>
  );
}
