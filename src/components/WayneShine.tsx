"use client";

import { useEffect, useRef } from "react";

// Wayne Shine — the Bruce Wayne (light) persona ambient: a gold "Applied
// Sciences" R&D holo-desk. Layers, back to front —
//   · a faint blueprint grid with intersection ticks,
//   · a live node-network (drifting nodes + proximity links),
//   · rotating orbit/atom diagrams with a gear-tooth ring,
//   · an animated dashed schematic bracket that keeps "drawing",
//   · corner HUD brackets framing the viewport,
//   · rising Wayne-Enterprises data glyphs.
// Decorative, pointer-events:none. Only renders in light mode (the rAF
// short-circuits otherwise); hidden in dark / calm / effects-off via CSS.
export default function WayneShine() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let raf = 0, w = 0, h = 0, t = 0;
    const R = (a: number, b: number) => a + Math.random() * (b - a);
    const G = (a: number) => `rgba(176,132,43,${a})`;   // gold line
    const GB = (a: number) => `rgba(214,170,90,${a})`;  // brighter gold accent

    type Node = { x: number; y: number; vx: number; vy: number };
    type Ring = { r: number; sp: number; n: number; ph: number };
    type Orbit = { cx: number; cy: number; rings: Ring[] };
    type Tick = { x: number; y: number; vy: number; a: number; txt: string; size: number };

    let nodes: Node[] = [], orbits: Orbit[] = [], ticks: Tick[] = [];
    const GLYPHS = ["312.40", "▲", "+1.8%", "R&D", "826", "▼", "0.4%", "WYE", "NYSE", "◆", "+2.1%", "APPLIED"];

    function seed() {
      const nn = Math.min(48, Math.max(22, Math.round((w * h) / 42000)));
      nodes = Array.from({ length: nn }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: R(-0.12, 0.12), vy: R(-0.12, 0.12) }));
      orbits = [
        { cx: w * 0.17, cy: h * 0.26 }, { cx: w * 0.84, cy: h * 0.72 }, { cx: w * 0.5, cy: h * 0.52 },
      ].map((o) => ({
        cx: o.cx, cy: o.cy,
        rings: [
          { r: R(30, 46), sp: R(0.22, 0.42), n: 2 + ((Math.random() * 2) | 0), ph: R(0, 6.28) },
          { r: R(60, 84), sp: -R(0.12, 0.28), n: 3, ph: R(0, 6.28) },
        ],
      }));
      ticks = Array.from({ length: 10 }, () => ({ x: Math.random() * w, y: R(0, h), vy: R(0.14, 0.36), a: R(0.1, 0.3), txt: GLYPHS[(Math.random() * GLYPHS.length) | 0], size: R(9, 13) }));
    }
    function resize() { w = cv!.width = window.innerWidth; h = cv!.height = window.innerHeight; seed(); }
    resize();
    window.addEventListener("resize", resize);

    function frame() {
      raf = requestAnimationFrame(frame);
      if (!document.documentElement.classList.contains("light")) { ctx!.clearRect(0, 0, w, h); return; }
      t += 0.016;
      ctx!.clearRect(0, 0, w, h);

      // 1 · blueprint grid + intersection ticks
      ctx!.lineWidth = 1;
      ctx!.strokeStyle = G(0.04);
      const gs = 94;
      for (let x = 0; x < w; x += gs) { ctx!.beginPath(); ctx!.moveTo(x, 0); ctx!.lineTo(x, h); ctx!.stroke(); }
      for (let y = 0; y < h; y += gs) { ctx!.beginPath(); ctx!.moveTo(0, y); ctx!.lineTo(w, y); ctx!.stroke(); }
      ctx!.strokeStyle = G(0.07);
      for (let x = gs; x < w; x += gs) for (let y = gs; y < h; y += gs) {
        ctx!.beginPath(); ctx!.moveTo(x - 3, y); ctx!.lineTo(x + 3, y); ctx!.moveTo(x, y - 3); ctx!.lineTo(x, y + 3); ctx!.stroke();
      }

      // 2 · node-network (drift + proximity links)
      for (const n of nodes) { n.x += n.vx; n.y += n.vy; if (n.x < 0 || n.x > w) n.vx *= -1; if (n.y < 0 || n.y > h) n.vy *= -1; }
      ctx!.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y, d = Math.hypot(dx, dy);
        if (d < 155) { ctx!.strokeStyle = G(0.1 * (1 - d / 155)); ctx!.beginPath(); ctx!.moveTo(nodes[i].x, nodes[i].y); ctx!.lineTo(nodes[j].x, nodes[j].y); ctx!.stroke(); }
      }
      ctx!.fillStyle = GB(0.28);
      for (const n of nodes) { ctx!.beginPath(); ctx!.arc(n.x, n.y, 1.3, 0, 6.283); ctx!.fill(); }

      // 3 · orbit / atom diagrams with gear-tooth ring
      for (const o of orbits) {
        ctx!.fillStyle = GB(0.5); ctx!.beginPath(); ctx!.arc(o.cx, o.cy, 2.4, 0, 6.283); ctx!.fill();
        for (const rg of o.rings) {
          ctx!.lineWidth = 1; ctx!.strokeStyle = G(0.1);
          ctx!.beginPath(); ctx!.arc(o.cx, o.cy, rg.r, 0, 6.283); ctx!.stroke();
          for (let k = 0; k < rg.n; k++) {
            const ang = t * rg.sp + rg.ph + (k * 6.283) / rg.n;
            const px = o.cx + Math.cos(ang) * rg.r, py = o.cy + Math.sin(ang) * rg.r;
            ctx!.strokeStyle = G(0.05); ctx!.beginPath(); ctx!.moveTo(o.cx, o.cy); ctx!.lineTo(px, py); ctx!.stroke();
            ctx!.fillStyle = GB(0.5); ctx!.beginPath(); ctx!.arc(px, py, 2.2, 0, 6.283); ctx!.fill();
          }
        }
        const outer = o.rings[o.rings.length - 1].r + 14, teeth = 26;
        ctx!.strokeStyle = G(0.1); ctx!.lineWidth = 1;
        for (let k = 0; k < teeth; k++) {
          const a = t * 0.14 + (k * 6.283) / teeth;
          ctx!.beginPath();
          ctx!.moveTo(o.cx + Math.cos(a) * outer, o.cy + Math.sin(a) * outer);
          ctx!.lineTo(o.cx + Math.cos(a) * (outer + 4), o.cy + Math.sin(a) * (outer + 4));
          ctx!.stroke();
        }
      }

      // 4 · animated dashed schematic bracket (keeps drawing)
      ctx!.setLineDash([6, 6]); ctx!.lineDashOffset = -t * 24; ctx!.strokeStyle = G(0.13); ctx!.lineWidth = 1;
      ctx!.strokeRect(w * 0.5 - 78, h * 0.52 - 60, 156, 120);
      ctx!.setLineDash([]);

      // 5 · corner HUD brackets
      ctx!.strokeStyle = G(0.16); ctx!.lineWidth = 1.5;
      const m = 26, L = 26;
      const corners: [number, number, number, number][] = [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]];
      for (const [cx, cy, sx, sy] of corners) { ctx!.beginPath(); ctx!.moveTo(cx + sx * L, cy); ctx!.lineTo(cx, cy); ctx!.lineTo(cx, cy + sy * L); ctx!.stroke(); }

      // 6 · rising data glyphs
      ctx!.textAlign = "left";
      for (const tk of ticks) {
        tk.y -= tk.vy;
        if (tk.y < -16) { tk.y = h + R(10, 60); tk.x = Math.random() * w; tk.txt = GLYPHS[(Math.random() * GLYPHS.length) | 0]; }
        ctx!.font = `600 ${tk.size}px ui-monospace, Menlo, monospace`;
        ctx!.fillStyle = G(tk.a * Math.min(1, tk.y / 80));
        ctx!.fillText(tk.txt, tk.x, tk.y);
      }
    }
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={ref} className="wayne-shine" aria-hidden="true" />;
}
