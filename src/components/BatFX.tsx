"use client";

import { useEffect, useRef, useState } from "react";

// Ambient bat-computer effects — all decorative, fixed, pointer-events:none, and
// additive (no layout/behavior impact): targeting-scope crosshair that tracks
// the cursor, an ambient particle data-field, a cyan click-ripple, and a live
// telemetry clock in the nav. Animations always run (no reduced-motion gate).
export default function BatFX() {
  const [signal, setSignal] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scopeRef = useRef<HTMLDivElement>(null);
  const hRef = useRef<HTMLDivElement>(null);
  const vRef = useRef<HTMLDivElement>(null);
  const retRef = useRef<HTMLDivElement>(null);
  const coordRef = useRef<HTMLDivElement>(null);

  // targeting scope + click ripple
  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    function move(e: PointerEvent) {
      const sc = scopeRef.current;
      if (sc && !sc.classList.contains("on")) sc.classList.add("on");
      if (hRef.current) hRef.current.style.top = e.clientY + "px";
      if (vRef.current) vRef.current.style.left = e.clientX + "px";
      if (retRef.current) { retRef.current.style.left = e.clientX + "px"; retRef.current.style.top = e.clientY + "px"; }
      if (coordRef.current) {
        coordRef.current.style.left = e.clientX + 16 + "px";
        coordRef.current.style.top = e.clientY + 14 + "px";
        coordRef.current.textContent = `X:${String(e.clientX).padStart(4, "0")} Y:${String(e.clientY).padStart(4, "0")}`;
      }
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => scopeRef.current?.classList.remove("on"), 2500);
    }
    function down(e: PointerEvent) {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
      const r = document.createElement("div");
      r.className = "cave-ripple";
      r.style.left = e.clientX + "px";
      r.style.top = e.clientY + "px";
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 620);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerdown", down);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerdown", down); if (hideTimer) clearTimeout(hideTimer); };
  }, []);

  // ambient particle data-field
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let raf = 0, w = 0, h = 0;
    const N = 46;
    const pts = Array.from({ length: N }, () => ({ x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 0.0006, vy: (Math.random() - 0.5) * 0.0006, r: Math.random() * 1.4 + 0.4 }));
    function resize() { w = cv!.width = window.innerWidth; h = cv!.height = window.innerHeight; }
    resize();
    window.addEventListener("resize", resize);
    function frame() {
      ctx!.clearRect(0, 0, w, h);
      // Bruce Wayne persona (html.light): brass data-field; Batman: cyan.
      const wayne = document.documentElement.classList.contains("light");
      const dotColor = wayne ? "rgba(176,132,43,0.42)" : "rgba(53,224,255,0.5)";
      const linkColor = wayne ? "rgba(176,132,43,0.09)" : "rgba(53,224,255,0.08)";
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > 1) p.vx *= -1;
        if (p.y < 0 || p.y > 1) p.vy *= -1;
        const px = p.x * w, py = p.y * h;
        ctx!.beginPath();
        ctx!.arc(px, py, p.r, 0, Math.PI * 2);
        ctx!.fillStyle = dotColor;
        ctx!.fill();
      }
      // faint links between near particles
      ctx!.strokeStyle = linkColor;
      ctx!.lineWidth = 0.5;
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        const dx = (pts[i].x - pts[j].x) * w, dy = (pts[i].y - pts[j].y) * h;
        const d = Math.hypot(dx, dy);
        if (d < 130) { ctx!.globalAlpha = 1 - d / 130; ctx!.beginPath(); ctx!.moveTo(pts[i].x * w, pts[i].y * h); ctx!.lineTo(pts[j].x * w, pts[j].y * h); ctx!.stroke(); }
      }
      ctx!.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  // live telemetry clock (updates the nav element if present)
  useEffect(() => {
    function tick() {
      const el = document.getElementById("cave-clock");
      if (el) {
        const d = new Date();
        const p = (n: number) => String(n).padStart(2, "0");
        el.textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
      }
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // decode / scramble-in effect for [.cave-decode] headings on mount
  useEffect(() => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789/·◤◢";
    const timers: ReturnType<typeof setInterval>[] = [];
    document.querySelectorAll<HTMLElement>(".cave-decode").forEach((el) => {
      const final = el.textContent || "";
      let f = 0;
      const id = setInterval(() => {
        f++;
        el.textContent = final
          .split("")
          .map((c, i) => (i < f / 2 || c === " " ? c : chars[Math.floor(Math.random() * chars.length)]))
          .join("");
        if (f / 2 >= final.length) { el.textContent = final; clearInterval(id); }
      }, 45);
      timers.push(id);
    });
    return () => timers.forEach(clearInterval);
  }, []);

  // flash KPI numbers when their value changes (filters / window)
  useEffect(() => {
    const root = document.querySelector(".cave-kpis");
    if (!root) return;
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        const node = m.type === "characterData" ? m.target.parentElement : (m.target as HTMLElement);
        const el = (node && "closest" in node ? node.closest(".tabular-nums") : null) as HTMLElement | null;
        if (el) { el.classList.remove("cave-flash"); void el.offsetWidth; el.classList.add("cave-flash"); }
      }
    });
    obs.observe(root, { subtree: true, childList: true, characterData: true });
    return () => obs.disconnect();
  }, []);

  // boot % counter (runs alongside the CSS boot bar)
  useEffect(() => {
    const el = document.getElementById("cave-pct");
    if (!el) return;
    let p = 0;
    const id = setInterval(() => {
      p = Math.min(100, p + Math.round(6 + Math.random() * 12));
      el.textContent = p + "%";
      if (p >= 100) clearInterval(id);
    }, 70);
    return () => clearInterval(id);
  }, []);

  // Shift+B (or the nav emblem click) → fire the bat-signal
  useEffect(() => {
    function fire() { setSignal(true); setTimeout(() => setSignal(false), 1700); }
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
      if (e.shiftKey && (e.key === "B" || e.key === "b")) fire();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("cave-batsignal", fire as EventListener);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("cave-batsignal", fire as EventListener); };
  }, []);

  // one-time count-up for the KPI numbers on load
  useEffect(() => {
    const t = setTimeout(() => {
      document.querySelectorAll<HTMLElement>(".cave-kpis .tabular-nums").forEach((el) => {
        const raw = (el.textContent || "").trim();
        if (raw.includes("/") || !/\d/.test(raw)) return; // skip non-single-number cells
        const pre = raw.slice(0, raw.search(/[\d.]/));
        const post = raw.slice(raw.length - (raw.match(/[^\d.,]*$/)?.[0].length || 0));
        const target = parseFloat(raw.replace(/[^0-9.]/g, ""));
        if (!isFinite(target)) return;
        const dec = raw.includes(".");
        const t0 = performance.now(), dur = 850;
        function step(now: number) {
          const p = Math.min(1, (now - t0) / dur);
          const v = target * (1 - Math.pow(1 - p, 3));
          el.textContent = pre + (dec ? v.toFixed(1) : Math.round(v).toLocaleString("en-US")) + post;
          if (p < 1) requestAnimationFrame(step);
          else el.textContent = raw;
        }
        requestAnimationFrame(step);
      });
    }, 220);
    return () => clearTimeout(t);
  }, []);

  const TICK = ["◈ UPLINK NOMINAL", "826 UNITS TRACKED", "THREAT MATRIX ARMED", "ENCRYPTED FEED", "SCAN CYCLE COMPLETE", "GRID SYNCED", "WAYNE ENTERPRISES R&D", "CAVE//OS v4"];

  return (
    <>
      <canvas ref={canvasRef} className="cave-field" aria-hidden="true" />
      <div className="cave-crt" aria-hidden="true" />
      <div className="cave-scancycle" aria-hidden="true" />
      <div ref={scopeRef} className="cave-scope" aria-hidden="true">
        <div ref={hRef} className="cave-xh" />
        <div ref={vRef} className="cave-xv" />
        <div ref={retRef} className="cave-reticle"><span className="a" /><span className="b" /><span className="c" /><span className="d" /><i /></div>
        <div ref={coordRef} className="cave-coord" />
      </div>
      <div className="cave-ticker" aria-hidden="true">
        <span className="track">
          {[...TICK, ...TICK].map((s, i) => (
            <span key={i}>{s}&nbsp;&nbsp;·&nbsp;&nbsp;</span>
          ))}
        </span>
      </div>
      {signal && (
        <div className="cave-signal" aria-hidden="true">
          <svg viewBox="0 0 100 44"><path d="M50 3 C48 11 45 14 41 12 C43 16 42 19 39 20 C33 15 25 16 20 23 C26 21 30 23 31 27 C25 28 20 32 18 39 C24 34 33 33 37 37 C40 30 45 28 50 33 C55 28 60 30 63 37 C67 33 76 34 82 39 C80 32 75 28 69 27 C70 23 74 21 80 23 C75 16 67 15 61 20 C58 19 57 16 59 12 C55 14 52 11 50 3 Z" /></svg>
        </div>
      )}
    </>
  );
}
