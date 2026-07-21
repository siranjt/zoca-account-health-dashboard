"use client";

import { useEffect, useState } from "react";

// Detective Mode — an Arkham-style vision lens. Toggles `detective` on <html>;
// globals.css lays a blue vision tint + scanlines over the deck and lights up
// the data (threat dots, at-risk rows, KPIs glow like an X-ray scan). It's a
// lens over whichever persona is active. The fixed overlays live here so they
// cover the viewport regardless of the nav's position. Persisted (cave-detective).
export default function DetectiveToggle() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    let d = false;
    try { d = localStorage.getItem("cave-detective") === "1"; } catch { /* ignore */ }
    setOn(d);
    document.documentElement.classList.toggle("detective", d);
  }, []);

  function toggle() {
    const next = !on;
    setOn(next);
    document.documentElement.classList.toggle("detective", next);
    try { localStorage.setItem("cave-detective", next ? "1" : "0"); } catch { /* ignore */ }
  }

  return (
    <>
      <button
        onClick={toggle}
        title={on ? "Detective vision ON — click to exit" : "Detective Mode — X-ray vision over the data"}
        className="rounded-md border px-2 py-1.5 text-[10px] uppercase tracking-[0.12em]"
        style={{ borderColor: "var(--cave-line)", color: on ? "#7fd0ff" : "var(--cave-dim)" }}
      >
        {on ? "◎ Detective" : "◉ Detective"}
      </button>
      {/* fixed vision overlays — shown only while html.detective is set */}
      <div className="detective-tint" aria-hidden="true" />
      <div className="detective-overlay" aria-hidden="true">
        <span className="detective-hud">◤◢ DETECTIVE MODE · SCANNING</span>
      </div>
    </>
  );
}
