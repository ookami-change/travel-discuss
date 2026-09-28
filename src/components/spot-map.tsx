"use client";

import "leaflet/dist/leaflet.css";
import type { Map as LMap, LayerGroup } from "leaflet";
import { useEffect, useRef, useState } from "react";
import type { Spot } from "@/lib/explore";

export const quietColor = (q: number) => (q >= 70 ? "#16a34a" : q >= 40 ? "#d97706" : "#dc2626");

// 高德 raster tiles are GCJ-02, the same datum as the POI coordinates, so markers line up without conversion.
const TILES = "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}";

/** Spots as colour-coded dots (green = 冷门). Leaflet touches `window`, so it is loaded client-side only. */
export function SpotMap({ spots, selected, onSelect }: { spots: Spot[]; selected: string | null; onSelect: (poiId: string) => void }) {
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
    for (const s of spots) {
      const on = s.poiId === selected;
      cur.L.circleMarker([s.lat, s.lng], {
        radius: on ? 10 : 6,
        color: on ? "#111" : "#fff",
        weight: on ? 3 : 1,
        fillColor: quietColor(s.quiet),
        fillOpacity: 0.9,
      })
        .bindTooltip(`${s.name} · 冷门度 ${s.quiet}`)
        .on("click", () => onSelectRef.current(s.poiId))
        .addTo(cur.layer);
    }
  }, [ready, spots, selected]);

  // Fly to a spot picked from the list.
  useEffect(() => {
    const s = spots.find((x) => x.poiId === selected);
    if (s && ready && map.current) map.current.map.flyTo([s.lat, s.lng], Math.max(map.current.map.getZoom(), 11), { duration: 0.6 });
  }, [ready, selected, spots]);

  return <div ref={el} className="isolate h-[45dvh] min-h-64 w-full overflow-hidden rounded-2xl border border-line" />;
}
