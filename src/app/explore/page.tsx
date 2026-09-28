"use client";

import { useEffect, useMemo, useState } from "react";
import { quietColor, SpotMap } from "@/components/spot-map";
import { Card, ErrorText, PageHeader, Select, useAsync } from "@/components/ui";
import { api, useApi } from "@/lib/client";
import { AMENITY_RADIUS, isHiddenGem, type Spot } from "@/lib/explore";

type ExploreData = {
  regions: { province: string; cities: { adcode: string; name: string; fetchedAt: string | null; stale: boolean }[] }[];
  spots: Spot[];
};

const LIST_LIMIT = 60;

export default function Explore() {
  const { data, error, mutate } = useApi<ExploreData>("/api/explore");
  const scan = useAsync();
  const [scanning, setScanning] = useState<string | null>(null);
  const [city, setCity] = useState("all");
  const [minQuiet, setMinQuiet] = useState(0);
  const [gemsOnly, setGemsOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const scanned = useMemo(() => data?.regions.flatMap((r) => r.cities).filter((c) => c.fetchedAt) ?? [], [data]);
  const spots = useMemo(
    () =>
      (data?.spots ?? [])
        .filter((s) => (city === "all" || s.city === city) && s.quiet >= minQuiet && (!gemsOnly || isHiddenGem(s)))
        .sort((a, b) => b.quiet - a.quiet || (b.rating ?? 0) - (a.rating ?? 0)),
    [data, city, minQuiet, gemsOnly],
  );

  const current = scanned.find((c) => c.name === city);
  const runScan = (adcode: string, name: string, force = false) =>
    scan.run(async () => {
      setScanning(name);
      try {
        await api("POST", "/api/explore/scan", { adcode, force });
        await mutate();
        setCity(name);
      } finally {
        setScanning(null);
      }
    });

  // Keep the picked spot's card in view when it was chosen on the map.
  useEffect(() => {
    if (selected) document.getElementById(`spot-${selected}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selected]);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16">
      <PageHeader title="找人少的景点" back="/" />

      <Card className="space-y-3 p-4">
        <p className="text-sm text-muted">
          点城市扫描它的风景名胜、公园和自然保护区（每城约 1 分钟）。冷门度看的是景点周边 {AMENITY_RADIUS / 1000}km 内餐馆和酒店有多少：配套越少，游客通常越少；世界遗产、国家级景点再额外扣分。标「旧」的城市是按旧规则扫的（不含公园和保护区），选中后可以重新扫描。
        </p>
        {data?.regions.map((r) => (
          <div key={r.province}>
            <h2 className="mb-1.5 text-sm font-medium">{r.province}</h2>
            <div className="flex flex-wrap gap-1.5">
              {r.cities.map((c) => (
                <button
                  key={c.adcode}
                  disabled={scan.busy}
                  onClick={() => (c.fetchedAt ? setCity(c.name) : runScan(c.adcode, c.name))}
                  className={`h-8 rounded-full border px-3 text-sm transition disabled:opacity-50 ${
                    city === c.name ? "border-accent bg-accent text-accent-fg" : c.fetchedAt ? "border-accent/40 bg-accent-soft" : "border-line bg-card text-muted"
                  }`}
                  title={c.fetchedAt ? `${c.stale ? "旧规则" : "已"}扫描 ${new Date(c.fetchedAt).toLocaleDateString()}` : "点击扫描"}
                >
                  {c.name}
                  {!c.fetchedAt && " ＋"}
                  {c.stale && <span className="ml-0.5 text-xs opacity-70">·旧</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
        {current && !scanning && (
          <button disabled={scan.busy} onClick={() => runScan(current.adcode, current.name, true)} className="text-sm text-accent hover:underline disabled:opacity-50">
            ↻ 重新扫描{current.name}
            {current.fetchedAt && <span className="text-muted">（上次 {new Date(current.fetchedAt).toLocaleDateString()}）</span>}
          </button>
        )}
        {scanning && <p className="text-sm text-accent">正在扫描{scanning}，大约 1 分钟…</p>}
        <ErrorText error={scan.error ?? error} />
      </Card>

      {scanned.length > 0 && (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="block space-y-1">
              <span className="text-xs text-muted">城市</span>
              <Select value={city} onChange={(e) => setCity(e.target.value)} className="h-9 w-32 text-sm">
                <option value="all">全部已扫描</option>
                {scanned.map((c) => (
                  <option key={c.adcode}>{c.name}</option>
                ))}
              </Select>
            </label>
            <label className="block flex-1 space-y-1">
              <span className="text-xs text-muted">冷门度 ≥ {minQuiet}</span>
              <input type="range" min={0} max={90} step={10} value={minQuiet} onChange={(e) => setMinQuiet(+e.target.value)} className="w-full accent-[var(--accent)]" />
            </label>
            <label className="flex h-9 items-center gap-1.5 text-sm">
              <input type="checkbox" checked={gemsOnly} onChange={(e) => setGemsOnly(e.target.checked)} />
              只看宝藏 💎
            </label>
          </div>

          <div className="mt-3">
            <SpotMap spots={spots} selected={selected} onSelect={setSelected} />
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
              <Legend q={80} label="冷门 ≥70" />
              <Legend q={50} label="一般 40–69" />
              <Legend q={0} label="热门 <40" />
              <span className="whitespace-nowrap sm:ml-auto">💎 = 冷门且评分 ≥4.5</span>
            </p>
          </div>

          <p className="mt-4 text-sm text-muted">
            {spots.length} 个景点{spots.length > LIST_LIMIT && `，列出前 ${LIST_LIMIT} 个`}
          </p>
          <div className="mt-2 space-y-2">
            {spots.slice(0, LIST_LIMIT).map((s) => (
              <SpotCard key={s.poiId} spot={s} selected={s.poiId === selected} onSelect={() => setSelected(s.poiId)} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function Legend({ q, label }: { q: number; label: string }) {
  return (
    <span className="flex items-center gap-1 whitespace-nowrap">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: quietColor(q) }} />
      {label}
    </span>
  );
}

function SpotCard({ spot: s, selected, onSelect }: { spot: Spot; selected: boolean; onSelect: () => void }) {
  const amap = `https://uri.amap.com/marker?position=${s.lng},${s.lat}&name=${encodeURIComponent(s.name)}&src=travel-discuss&coordinate=gaode&callnative=1`;

  return (
    <div id={`spot-${s.poiId}`} onClick={onSelect}>
      <Card className={`cursor-pointer p-3 ${selected ? "border-accent ring-2 ring-accent/20" : ""}`}>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl text-white" style={{ background: quietColor(s.quiet) }}>
            <span className="text-base font-bold leading-none">{s.quiet}</span>
            <span className="text-[10px] leading-none opacity-90">冷门度</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {s.name} {isHiddenGem(s) && "💎"}
            </p>
            <p className="truncate text-xs text-muted">
              {s.city}
              {s.district && s.district !== s.city && ` · ${s.district}`} · {s.type.split("|")[0].split(";").pop()}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              周边餐饮住宿 {s.amenities} 家{s.rating && ` · 评分 ${s.rating}`}
            </p>
          </div>
        </div>
        <div className="mt-2 flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          <a href={amap} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-xl border border-line bg-card px-3 text-sm font-medium hover:bg-bg">
            在高德打开
          </a>
        </div>
      </Card>
    </div>
  );
}
