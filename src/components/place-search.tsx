"use client";

import { useState } from "react";
import { Input } from "@/components/ui";
import { useTrip } from "@/components/trip-context";
import { api } from "@/lib/client";
import type { PlaceHit } from "@/lib/types";

export type PlaceValue = { address: string | null; lng: number | null; lat: number | null; poiId: string | null };

/**
 * Search 高德 for a place; picking one fills the title (if empty) and location.
 * Falls back to free-text address when no key is configured or nothing matches.
 */
export function PlaceSearch({
  query,
  value,
  onPick,
  onAddress,
}: {
  query: string;
  value: PlaceValue;
  onPick: (hit: PlaceHit) => void;
  onAddress: (address: string) => void;
}) {
  const { base } = useTrip();
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  // Results belong to the query they were fetched for; editing the name hides them.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === query;
  const setOpen = (v: boolean) => setOpenFor(v ? query : null);

  async function search() {
    if (!query.trim()) return setMsg("先填写名称再搜索");
    setSearching(true);
    setMsg(null);
    try {
      const r = await api<PlaceHit[]>("GET", `${base}/places?q=${encodeURIComponent(query)}`);
      setHits(r);
      setOpen(true);
      if (!r.length) setMsg("没有找到，可以直接填写地址");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={value.address ?? ""}
          onChange={(e) => onAddress(e.target.value)}
          placeholder="地址（可选）"
          maxLength={200}
          className="flex-1"
        />
        <button type="button" onClick={search} className="h-11 shrink-0 rounded-xl border border-line bg-card px-3 text-sm text-accent">
          {searching ? "搜索中" : "🔍 搜高德"}
        </button>
      </div>
      {value.lng != null && <p className="text-xs text-accent">📍 已定位，可一键导航</p>}
      {msg && <p className="text-xs text-muted">{msg}</p>}
      {open && hits.length > 0 && (
        <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-xl border border-line bg-card">
          {hits.map((h, i) => (
            <li key={h.poiId ?? i}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-bg"
                onClick={() => {
                  onPick(h);
                  setOpen(false);
                }}
              >
                <span className="block text-sm font-medium">{h.name}</span>
                <span className="block text-xs text-muted">{[h.district, h.address].filter(Boolean).join(" ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
