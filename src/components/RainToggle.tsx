"use client";

import { useEffect, useState } from "react";

// One ambient toggle for both personas: Gotham Rain (Batman/dark) and Wayne
// Shine (Bruce Wayne/light). ON by default. Setting `rain-off` on <html> hides
// both via globals.css; the choice is persisted (cave-rain). The label follows
// the active persona.
export default function RainToggle() {
  const [on, setOn] = useState(true);
  const [light, setLight] = useState(false);

  useEffect(() => {
    let effOn = true;
    try { effOn = localStorage.getItem("cave-rain") !== "0"; } catch { /* ignore */ }
    setOn(effOn);
    document.documentElement.classList.toggle("rain-off", !effOn);
    const upd = () => setLight(document.documentElement.classList.contains("light"));
    upd();
    const obs = new MutationObserver(upd);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  function toggle() {
    const next = !on;
    setOn(next);
    document.documentElement.classList.toggle("rain-off", !next);
    try { localStorage.setItem("cave-rain", next ? "1" : "0"); } catch { /* ignore */ }
  }

  const label = light ? (on ? "✨ Shine" : "○ Still") : (on ? "🌧 Rain" : "🌤 Clear");
  const title = light
    ? (on ? "Wayne Shine ON — sunlit motes & ticker; click for a still room" : "Wayne Shine OFF — click to let the light in")
    : (on ? "Gotham Rain ON — click to stop the storm" : "Gotham Rain OFF — click to bring the storm");

  return (
    <button
      onClick={toggle}
      title={title}
      className="rounded-md border px-2 py-1.5 text-[10px] uppercase tracking-[0.12em]"
      style={{ borderColor: "var(--cave-line)", color: on ? (light ? "#b8860b" : "#7fd0ff") : "var(--cave-dim)" }}
    >
      {label}
    </button>
  );
}
