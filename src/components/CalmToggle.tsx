"use client";

import { useEffect, useState } from "react";

// Toggles a `calm` class on <html> — globals.css hides the ambient battech FX
// (crosshair, particles, scanlines, scan-cycle, radar, ticker, pulses) while
// keeping every interaction (ripple, hover glows, KPI flash, bat-signal, etc.).
export default function CalmToggle() {
  const [calm, setCalm] = useState(false);

  useEffect(() => {
    let c = false;
    try { c = localStorage.getItem("cave-calm") === "1"; } catch { /* ignore */ }
    setCalm(c);
    document.documentElement.classList.toggle("calm", c);
  }, []);

  function toggle() {
    const next = !calm;
    setCalm(next);
    document.documentElement.classList.toggle("calm", next);
    try { localStorage.setItem("cave-calm", next ? "1" : "0"); } catch { /* ignore */ }
  }

  return (
    <button
      onClick={toggle}
      title={calm ? "Calm mode ON — ambient FX dimmed. Click for full battech." : "Full battech FX — click to calm the ambient effects."}
      className="rounded-md border px-2 py-1.5 text-[10px] uppercase tracking-[0.12em]"
      style={{ borderColor: "var(--cave-line)", color: calm ? "var(--cave-dim)" : "var(--cave-cy)" }}
    >
      {calm ? "◐ Calm" : "◉ FX"}
    </button>
  );
}
