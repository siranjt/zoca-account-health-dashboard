"use client";

import { useEffect, useState } from "react";

// Toggles Gotham Rain on/off. Rain is ON by default (Batman-side). Setting
// `rain-off` on <html> hides the storm via globals.css; the choice is
// persisted (cave-rain) and applied on mount.
export default function RainToggle() {
  const [on, setOn] = useState(true);

  useEffect(() => {
    let rainOn = true;
    try { rainOn = localStorage.getItem("cave-rain") !== "0"; } catch { /* ignore */ }
    setOn(rainOn);
    document.documentElement.classList.toggle("rain-off", !rainOn);
  }, []);

  function toggle() {
    const next = !on;
    setOn(next);
    document.documentElement.classList.toggle("rain-off", !next);
    try { localStorage.setItem("cave-rain", next ? "1" : "0"); } catch { /* ignore */ }
  }

  return (
    <button
      onClick={toggle}
      title={on ? "Gotham Rain ON — click to stop the storm" : "Gotham Rain OFF — click to bring the storm"}
      className="rounded-md border px-2 py-1.5 text-[10px] uppercase tracking-[0.12em]"
      style={{ borderColor: "var(--cave-line)", color: on ? "#7fd0ff" : "var(--cave-dim)" }}
    >
      {on ? "🌧 Rain" : "🌤 Clear"}
    </button>
  );
}
