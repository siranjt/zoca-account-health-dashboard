"use client";

import { useEffect, useState } from "react";

// Toggles a `light` class on <html>; globals.css restores light surfaces there.
// Applies the persisted choice on mount (brief flash acceptable — dark is default).
export default function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    let l = false;
    try { l = localStorage.getItem("cave-theme") === "light"; } catch { /* ignore */ }
    setLight(l);
    document.documentElement.classList.toggle("light", l);
  }, []);

  function toggle() {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle("light", next);
    try { localStorage.setItem("cave-theme", next ? "light" : "dark"); } catch { /* ignore */ }
  }

  return (
    <button
      onClick={toggle}
      title={light ? "Switch to dark" : "Switch to light"}
      className="rounded-md border px-2 py-1.5 text-xs"
      style={{ borderColor: "var(--cave-line)", color: "var(--cave-dim)" }}
    >
      {light ? "🌙" : "☀️"}
    </button>
  );
}
