"use client";

import { useEffect, useRef } from "react";

// Wayne Shine — the daylight counterpart to Gotham Rain, for the Bruce Wayne
// (light) persona. One fixed canvas layering three warm-gold effects:
//   1. golden dust motes drifting & swaying in sunlight,
//   2. a faint Applied-Sciences blueprint grid + slow schematic diagonals,
//   3. rising ticker glyphs (Wayne Enterprises trading-floor drift).
// Decorative, pointer-events:none, additive. Only renders in light mode (the
// rAF short-circuits otherwise); hidden in dark / calm / effects-off via CSS.
export default function WayneShine() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let raf = 0, w = 0, h = 0, t = 0;
    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    type Mote = { x: number; y: number; r: number; a: number; vy: number; drift: number; ph: number };
    type Tick = { x: number; y: number; vy: number; a: number; txt: string; size: number };
    let motes: Mote[] = [], ticks: Tick[] = [];
    const GLYPHS = ["312.40", "▲", "+1.8%", "WYE", "826", "▼", "0.4%", "APPLIED", "R&D", "+2.1%", "▲", "NYSE"];

    function seed() {
      const N = Math.min(70, Math.max(28, Math.round((w * h) / 26000)));
      motes = Array.from({ length: N }, () => ({ x: Math.random() * w, y: Math.random() * h, r: rand(0.8, 3), a: rand(0.14, 0.5), vy: rand(0.05, 0.26), drift: rand(6, 22), ph: rand(0, 6.28) }));
      ticks = Array.from({ length: 12 }, () => ({ x: Math.random() * w, y: rand(0, h), vy: rand(0.15, 0.42), a: rand(0.1, 0.34), txt: GLYPHS[Math.floor(Math.random() * GLYPHS.length)], size: rand(9, 14) }));
    }
    function resize() { w = cv!.width = window.innerWidth; h = cv!.height = window.innerHeight; seed(); }
    resize();
    window.addEventListener("resize", resize);

    function frame() {
      raf = requestAnimationFrame(frame);
      // Only draw in the Bruce Wayne persona — save CPU in Batman mode.
      if (!document.documentElement.classList.contains("light")) { ctx!.clearRect(0, 0, w, h); return; }
      t += 0.016;
      ctx!.clearRect(0, 0, w, h);

      // 3 · blueprint grid (faint gold, slow horizontal drift)
      ctx!.lineWidth = 1;
      ctx!.strokeStyle = "rgba(176,132,43,0.055)";
      const g = 84, off = (t * 4) % g;
      for (let x = off; x < w; x += g) { ctx!.beginPath(); ctx!.moveTo(x, 0); ctx!.lineTo(x, h); ctx!.stroke(); }
      for (let y = 0; y < h; y += g) { ctx!.beginPath(); ctx!.moveTo(0, y); ctx!.lineTo(w, y); ctx!.stroke(); }
      // a slow schematic diagonal sweeping across
      ctx!.strokeStyle = "rgba(176,132,43,0.08)";
      const d1 = ((t * 16) % (w + 320)) - 160;
      ctx!.beginPath(); ctx!.moveTo(d1, 0); ctx!.lineTo(d1 + 220, h); ctx!.stroke();

      // 4 · rising ticker glyphs
      ctx!.textAlign = "left";
      for (const tk of ticks) {
        tk.y -= tk.vy;
        if (tk.y < -18) { tk.y = h + rand(10, 60); tk.x = Math.random() * w; tk.txt = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]; }
        ctx!.font = `600 ${tk.size}px ui-monospace, Menlo, monospace`;
        ctx!.fillStyle = `rgba(176,132,43,${tk.a})`;
        ctx!.fillText(tk.txt, tk.x, tk.y);
      }

      // 1 · golden dust motes (drift up + gentle sway + soft glow)
      for (const m of motes) {
        m.y -= m.vy;
        if (m.y < -6) { m.y = h + rand(2, 30); m.x = Math.random() * w; }
        const gx = m.x + Math.sin(t * 0.6 + m.ph) * m.drift;
        const R = m.r * 3;
        const grd = ctx!.createRadialGradient(gx, m.y, 0, gx, m.y, R);
        grd.addColorStop(0, `rgba(242,206,120,${m.a})`);
        grd.addColorStop(1, "rgba(242,206,120,0)");
        ctx!.fillStyle = grd;
        ctx!.beginPath(); ctx!.arc(gx, m.y, R, 0, Math.PI * 2); ctx!.fill();
      }
    }
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={ref} className="wayne-shine" aria-hidden="true" />;
}
