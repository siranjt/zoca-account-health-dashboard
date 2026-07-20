"use client";

import { useEffect, useRef, useState } from "react";
import type { AccountRow } from "@/lib/types";

// Loads Leaflet from CDN once (no npm dep). Real interactive map: pan/zoom,
// per-account markers by real lat/lng (entities.locations), colored by health.
let leafletPromise: Promise<any> | null = null;
function loadLeaflet(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject();
  if ((window as any).L) return Promise.resolve((window as any).L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.async = true;
    s.onload = () => resolve((window as any).L);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return leafletPromise;
}

const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const hex = (c: string) => (c === "red" ? "#dc2626" : c === "yellow" ? "#d97706" : "#16a34a");

export default function MapView({ rows }: { rows: AccountRow[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const pts = rows.filter((a) => typeof a.lat === "number" && typeof a.lng === "number" && Math.abs(a.lat!) <= 90 && Math.abs(a.lng!) <= 180);
  const noCoords = rows.length - pts.length;

  // init map once
  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !ref.current || mapRef.current) return;
        const map = L.map(ref.current, { scrollWheelZoom: true, worldCopyJump: true, attributionControl: true });
        mapRef.current = map;
        const dark = document.documentElement.classList.contains("light") === false;
        L.tileLayer(
          dark ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
          { maxZoom: 19, attribution: '© OpenStreetMap © CARTO' }
        ).addTo(map);
        layerRef.current = L.layerGroup().addTo(map);
        map.setView([39.5, -98.35], 4);
        setStatus("ready");
        setTimeout(() => map.invalidateSize(), 60);
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  // (re)draw markers when the filtered rows change
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapRef.current || !layerRef.current) return;
    layerRef.current.clearLayers();
    const bounds: [number, number][] = [];
    for (const a of pts) {
      const color = hex(a.health.color);
      const r = a.mrr ? Math.max(4, Math.min(16, 4 + Math.sqrt(a.mrr) / 5)) : 5;
      const m = L.circleMarker([a.lat, a.lng], { radius: r, color, weight: 1, fillColor: color, fillOpacity: 0.55 });
      m.bindPopup(
        `<div style="min-width:150px"><b>${esc(a.name)}</b><br>` +
          `${esc([a.city, a.state].filter(Boolean).join(", "))}<br>` +
          `${a.accountManager ? "AM " + esc(a.accountManager) + "<br>" : ""}` +
          `${a.mrr != null ? "MRR $" + a.mrr + " · " : ""}${a.health.tierLabel || ""}<br>` +
          `<a href="/account/${a.entityId}" style="color:#1899b4;font-weight:600">Open dossier →</a></div>`
      );
      m.addTo(layerRef.current);
      bounds.push([a.lat as number, a.lng as number]);
    }
    if (bounds.length) {
      try { mapRef.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 11 }); } catch { /* single point */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map((a) => a.entityId).join(",")]);

  return (
    <div className="mb-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#16a34a" }} /> Healthy</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#d97706" }} /> Monitor</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#dc2626" }} /> At risk</span>
        <span className="text-slate-500">· dot size ∝ MRR · click a dot to open</span>
        <span className="ml-auto">{pts.length} mapped{noCoords > 0 ? ` · ${noCoords} without coordinates` : ""}</span>
      </div>
      <div className="relative overflow-hidden rounded-lg border border-slate-200" style={{ height: "68vh" }}>
        <div ref={ref} className="h-full w-full" style={{ background: "var(--cave-panel2)" }} />
        {status !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
            {status === "error" ? "Couldn't load the map library." : "Loading map…"}
          </div>
        )}
      </div>
    </div>
  );
}
