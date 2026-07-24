"use client";

import { useEffect, useRef } from "react";

// Wayne Shine — the daylight counterpart to Gotham Rain, for the Bruce Wayne
// (light) persona: a golden-hour penthouse. Layers, back to front —
//   · a slow warm ambient wash (sun through the tall windows),
//   · soft god-rays streaming in and gently swaying,
//   · a faint Applied-Sciences blueprint grid + a slow schematic sweep,
//   · rising Wayne-Enterprises ticker glyphs,
//   · large soft bokeh (depth) + fine drifting dust motes that twinkle.
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
    const R = (a: number, b: number) => a + Math.random() * (b - a);

    type Ray = { base: number; wid: number; a: number; sway: number; ph: number };
    type Bokeh = { x: number; y: number; r: number; a: number; vy: number; drift: number; ph: number };
    type Mote = { x: number; y: number; r: number; a: number; vy: number; drift: number; ph: number; tw: number };
    type Tick = { x: number; y: number; vy: number; a: number; txt: string; size: number };

    let rays: Ray[] = [], bokeh: Bokeh[] = [], motes: Mote[] = [], ticks: Tick[] = [];
    const GLYPHS = ["312.40", "▲", "+1.8%", "WYE", "826", "▼", "0.4%", "APPLIED", "R&D", "+2.1%", "▲", "NYSE", "◆", "WE"];

    function seed() {
      rays = Array.from({ length: 6 }, (_, i) => ({ base: -0.12 + i * 0.12 + R(-0.02, 0.02), wid: R(70, 190), a: R(0.05, 0.12), sway: R(0.06, 0.16), ph: R(0, 6.28) }));
      const bk = Math.min(18, Math.max(9, Math.round((w * h) / 130000)));
      bokeh = Array.from({ length: bk }, () => ({ x: Math.random() * w, y: Math.random() * h, r: R(26, 78), a: R(0.03, 0.09), vy: R(0.05, 0.18), drift: R(10, 34), ph: R(0, 6.28) }));
      const nm = Math.min(90, Math.max(42, Math.round((w * h) / 18000)));
      motes = Array.from({ length: nm }, () => ({ x: Math.random() * w, y: Math.random() * h, r: R(0.7, 3.1), a: R(0.22, 0.62), vy: R(0.06, 0.32), drift: R(6, 26), ph: R(0, 6.28), tw: R(0.6, 1.8) }));
      ticks = Array.from({ length: 12 }, () => ({ x: Math.random() * w, y: R(0, h), vy: R(0.14, 0.4), a: R(0.1, 0.32), txt: GLYPHS[(Math.random() * GLYPHS.length) | 0], size: R(9, 14) }));
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
      const sunX = w * 0.82, sunY = -40;

      // 1 · warm ambient wash from the sun corner (breathing)
      const washA = 0.05 + 0.03 * Math.sin(t * 0.35);
      const wash = ctx!.createRadialGradient(sunX, sunY + 40, 40, sunX, sunY + 40, Math.hypot(w, h) * 0.9);
      wash.addColorStop(0, `rgba(232,196,120,${washA})`);
      wash.addColorStop(0.5, `rgba(214,170,90,${washA * 0.4})`);
      wash.addColorStop(1, "rgba(214,170,90,0)");
      ctx!.fillStyle = wash; ctx!.fillRect(0, 0, w, h);

      // 2 · god-rays streaming from the corner, swaying
      const len = Math.hypot(w, h) * 1.25;
      for (const r of rays) {
        const ang = r.base + Math.sin(t * r.sway + r.ph) * 0.05;
        const al = r.a * (0.6 + 0.4 * Math.sin(t * 0.5 + r.ph));
        ctx!.save();
        ctx!.translate(sunX, sunY);
        ctx!.rotate(Math.PI * 0.62 + ang); // fan down-left into the room
        const g = ctx!.createLinearGradient(0, 0, 0, len);
        g.addColorStop(0, `rgba(236,200,120,${Math.max(0, al)})`);
        g.addColorStop(0.7, `rgba(226,184,100,${Math.max(0, al) * 0.25})`);
        g.addColorStop(1, "rgba(226,184,100,0)");
        ctx!.fillStyle = g;
        ctx!.beginPath();
        ctx!.moveTo(-r.wid / 2, 0); ctx!.lineTo(r.wid / 2, 0); ctx!.lineTo(r.wid * 1.5, len); ctx!.lineTo(-r.wid * 1.5, len); ctx!.closePath();
        ctx!.fill();
        ctx!.restore();
      }

      // 3 · faint blueprint grid + a slow schematic sweep
      ctx!.lineWidth = 1;
      ctx!.strokeStyle = "rgba(176,132,43,0.04)";
      const gs = 96, off = (t * 4) % gs;
      for (let x = off; x < w; x += gs) { ctx!.beginPath(); ctx!.moveTo(x, 0); ctx!.lineTo(x, h); ctx!.stroke(); }
      for (let y = 0; y < h; y += gs) { ctx!.beginPath(); ctx!.moveTo(0, y); ctx!.lineTo(w, y); ctx!.stroke(); }
      ctx!.strokeStyle = "rgba(176,132,43,0.07)";
      const d1 = ((t * 15) % (w + 340)) - 170;
      ctx!.beginPath(); ctx!.moveTo(d1, 0); ctx!.lineTo(d1 + 240, h); ctx!.stroke();

      // 4 · rising ticker glyphs (fade near the top edge)
      ctx!.textAlign = "left";
      for (const tk of ticks) {
        tk.y -= tk.vy;
        if (tk.y < -18) { tk.y = h + R(10, 70); tk.x = Math.random() * w; tk.txt = GLYPHS[(Math.random() * GLYPHS.length) | 0]; }
        const fade = Math.min(1, tk.y / 80);
        ctx!.font = `600 ${tk.size}px ui-monospace, Menlo, monospace`;
        ctx!.fillStyle = `rgba(176,132,43,${tk.a * fade})`;
        ctx!.fillText(tk.txt, tk.x, tk.y);
      }

      // 5a · soft bokeh (depth layer)
      for (const b of bokeh) {
        b.y -= b.vy;
        if (b.y < -b.r) { b.y = h + b.r + R(2, 40); b.x = Math.random() * w; }
        const gx = b.x + Math.sin(t * 0.4 + b.ph) * b.drift;
        const grd = ctx!.createRadialGradient(gx, b.y, 0, gx, b.y, b.r);
        grd.addColorStop(0, `rgba(238,202,124,${b.a})`);
        grd.addColorStop(1, "rgba(238,202,124,0)");
        ctx!.fillStyle = grd;
        ctx!.beginPath(); ctx!.arc(gx, b.y, b.r, 0, Math.PI * 2); ctx!.fill();
      }

      // 5b · fine dust motes (twinkle + sway)
      for (const m of motes) {
        m.y -= m.vy;
        if (m.y < -6) { m.y = h + R(2, 30); m.x = Math.random() * w; }
        const gx = m.x + Math.sin(t * 0.6 + m.ph) * m.drift;
        const a = m.a * (0.55 + 0.45 * Math.sin(t * m.tw + m.ph));
        const rad = m.r * 3;
        const grd = ctx!.createRadialGradient(gx, m.y, 0, gx, m.y, rad);
        grd.addColorStop(0, `rgba(198,150,58,${Math.max(0, a)})`);
        grd.addColorStop(1, "rgba(198,150,58,0)");
        ctx!.fillStyle = grd;
        ctx!.beginPath(); ctx!.arc(gx, m.y, rad, 0, Math.PI * 2); ctx!.fill();
      }
    }
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={ref} className="wayne-shine" aria-hidden="true" />;
}
