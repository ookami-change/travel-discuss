"use client";

import "leaflet/dist/leaflet.css";
import type { Map as LMap, LayerGroup } from "leaflet";
import { useEffect, useRef, useState } from "react";
export type MapPoint = { id: string; lat: number; lng: number; score: number; label: string };

/** 0–100 score, higher is better (冷门 / 休闲). */
export const scoreColor = (q: number) => (q >= 70 ? "#16a34a" : q >= 40 ? "#d97706" : "#dc2626");

// 高德 raster tiles are GCJ-02, the same datum as the POI coordinates, so markers line up without conversion.
const TILES = "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}";

/** Places as colour-coded dots (green = high score). Leaflet touches `window`, so it is loaded client-side only. */
export function SpotMap({ points, selected, onSelect }: { points: MapPoint[]; selected: string | null; onSelect: (id: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<{ L: typeof import("leaflet"); map: LMap; layer: LayerGroup } | null>(null);
  const [ready, setReady] = useState(false);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !el.current) return;
      const m = L.map(el.current, { center: [23.3, 111.5], zoom: 6, attributionControl: false });
      L.tileLayer(TILES, { subdomains: "1234", maxZoom: 18 }).addTo(m);
      map.current = { L, map: m, layer: L.layerGroup().addTo(m) };
      setReady(true);
    });
    return () => {
      cancelled = true;
      map.current?.map.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const cur = map.current;
    if (!ready || !cur) return;
    cur.layer.clearLayers();
    for (const s of points) {
      const on = s.id === selected;
      cur.L.circleMarker([s.lat, s.lng], {
        radius: on ? 10 : 6,
        color: on ? "#111" : "#fff",
        weight: on ? 3 : 1,
        fillColor: scoreColor(s.score),
        fillOpacity: 0.9,
      })
        .bindTooltip(s.label)
        .on("click", () => onSelectRef.current(s.id))
        .addTo(cur.layer);
    }
  }, [ready, points, selected]);

  // Fly to a spot picked from the list.
  useEffect(() => {
    const s = points.find((x) => x.id === selected);
    if (s && ready && map.current) map.current.map.flyTo([s.lat, s.lng], Math.max(map.current.map.getZoom(), 11), { duration: 0.6 });
  }, [ready, selected, points]);

  return <div ref={el} className="isolate h-[45dvh] min-h-64 w-full overflow-hidden rounded-2xl border border-line" />;
}
