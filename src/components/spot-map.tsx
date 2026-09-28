"use client";

import "leaflet/dist/leaflet.css";
import type { CircleMarker, Map as LMap, LayerGroup } from "leaflet";
import { useEffect, useRef, useState } from "react";

export type MapPoint = { id: string; lat: number; lng: number; score: number; label: string };
/** A boundary as rings of [lng, lat] (public/explore-bounds.json). */
export type Rings = [number, number][][];

/** 0–100 score, higher is better (冷门 / 休闲). */
export const scoreColor = (q: number) => (q >= 70 ? "#16a34a" : q >= 40 ? "#d97706" : "#dc2626");

// 高德 raster tiles are GCJ-02, the same datum as the POI coordinates, so markers line up without conversion.
const TILES = "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}";
const OUTLINE = "#0f766e";

const markerStyle = (p: MapPoint, state: "selected" | "hovered" | "plain") =>
  state === "plain"
    ? { radius: 6, color: "#fff", weight: 1, fillColor: scoreColor(p.score), fillOpacity: 0.9 }
    : { radius: state === "selected" ? 10 : 9, color: state === "selected" ? "#111" : OUTLINE, weight: 3, fillColor: scoreColor(p.score), fillOpacity: 1 };

/**
 * Places as colour-coded dots (green = high score), plus an optional region outline; `fit` zooms to a region
 * whenever it changes. Leaflet touches `window`, so it is loaded client-side only.
 */
export function SpotMap({
  points,
  selected,
  hovered,
  onSelect,
  outline,
  fit,
}: {
  points: MapPoint[];
  selected: string | null;
  hovered: string | null;
  onSelect: (id: string) => void;
  outline: Rings | null;
  fit: Rings | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<{ L: typeof import("leaflet"); map: LMap; outline: LayerGroup; markers: LayerGroup } | null>(null);
  const markers = useRef(new Map<string, { marker: CircleMarker; point: MapPoint }>());
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
      // Outline group first so it renders under the markers.
      map.current = { L, map: m, outline: L.layerGroup().addTo(m), markers: L.layerGroup().addTo(m) };
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
    cur.markers.clearLayers();
    markers.current.clear();
    for (const p of points) {
      const marker = cur.L.circleMarker([p.lat, p.lng], markerStyle(p, p.id === selected ? "selected" : "plain"))
        .bindTooltip(p.label)
        .on("click", () => onSelectRef.current(p.id))
        .addTo(cur.markers);
      markers.current.set(p.id, { marker, point: p });
    }
    if (selected) markers.current.get(selected)?.marker.bringToFront();
  }, [ready, points, selected]);

  // Hover restyles a single dot instead of redrawing thousands.
  useEffect(() => {
    if (!ready || !hovered || hovered === selected) return;
    const m = markers.current.get(hovered);
    if (!m) return;
    m.marker.setStyle(markerStyle(m.point, "hovered")).bringToFront();
    return () => {
      m.marker.setStyle(markerStyle(m.point, "plain"));
    };
  }, [ready, hovered, selected, points]);

  useEffect(() => {
    const cur = map.current;
    if (!ready || !cur) return;
    cur.outline.clearLayers();
    if (!outline) return;
    const latLngs = outline.map((ring) => ring.map(([lng, lat]) => [lat, lng] as [number, number]));
    cur.L.polygon(latLngs, { color: OUTLINE, weight: 2, fillColor: OUTLINE, fillOpacity: 0.08, interactive: false }).addTo(cur.outline);
  }, [ready, outline]);

  useEffect(() => {
    const cur = map.current;
    if (!ready || !cur || !fit) return;
    cur.map.flyToBounds(cur.L.latLngBounds(fit.flat().map(([lng, lat]) => [lat, lng] as [number, number])), { padding: [16, 16], duration: 0.6 });
  }, [ready, fit]);

  // Fly to a place picked from the list — on selection only, not when filters reshuffle the points.
  const pointsRef = useRef(points);
  useEffect(() => {
    pointsRef.current = points;
  });
  useEffect(() => {
    const p = pointsRef.current.find((x) => x.id === selected);
    if (p && ready && map.current) map.current.map.flyTo([p.lat, p.lng], Math.max(map.current.map.getZoom(), 11), { duration: 0.6 });
  }, [ready, selected]);

  return <div ref={el} className="isolate h-[45dvh] min-h-64 w-full overflow-hidden rounded-2xl border border-line" />;
}
