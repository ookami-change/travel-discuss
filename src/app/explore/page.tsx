"use client";

import { useEffect, useMemo, useState } from "react";
import { scoreColor, SpotMap } from "@/components/spot-map";
import { Button, Card, ErrorText, PageHeader, Select, Sheet, useAsync } from "@/components/ui";
import { api, useApi } from "@/lib/client";
import { AMENITY_RADIUS, FOOD_RADIUS, GOOD_FOOD, isHiddenGem, type Spot, type StayView } from "@/lib/explore";

type Mode = "spots" | "stays";
type City = { adcode: string; name: string; fetchedAt: string | null; stale: boolean };
type ExploreData<T> = { regions: { province: string; cities: City[] }[]; items: T[] };

/** What the map and list show, whichever mode produced it. */
type Item = { id: string; name: string; city: string; lat: number; lng: number; score: number; gem: boolean; lines: string[] };

const MODES = {
  spots: {
    tab: "冷门景点",
    scoreName: "冷门度",
    noun: "个景点",
    intro: `点城市扫描它的风景名胜、公园和自然保护区。冷门度看的是景点周边 ${AMENITY_RADIUS / 1000}km 内餐馆和酒店有多少：配套越少，游客通常越少；世界遗产、国家级景点再额外扣分。标「旧」的城市是按旧规则扫的（不含公园和保护区），选中后可以重新扫描。`,
    cost: "大约 1 分钟，会调用约 200 次高德接口",
    legend: ["冷门 ≥70", "一般 40–69", "热门 <40"],
  },
  stays: {
    tab: "休闲好去处",
    scoreName: "休闲指数",
    noun: "个去处",
    intro: `不是景点，而是适合住下来放松的地方：评分 4.5 以上的酒店，${FOOD_RADIUS / 1000}km 内好吃的多，离景点越远越好。休闲指数 = 酒店评分 30% + 周边美食 35% + 离最近景点的距离 35%（8km 以上满分）。距离用的是「冷门景点」里扫过的景点，那边扫得越全越准。`,
    cost: "大约 40 秒，会调用约 90 次高德接口",
    legend: ["很好 ≥70", "一般 40–69", "较差 <40"],
  },
} as const;

const LIST_LIMIT = 60;

const place = (city: string, district: string | null, extra: string) => [city, district !== city && district, extra].filter(Boolean).join(" · ");

function spotItem(s: Spot): Item {
  return {
    id: s.poiId,
    name: s.name,
    city: s.city,
    lat: s.lat,
    lng: s.lng,
    score: s.quiet,
    gem: isHiddenGem(s),
    lines: [place(s.city, s.district, s.type.split("|")[0].split(";").pop() ?? ""), `周边餐饮住宿 ${s.amenities} 家${s.rating ? ` · 评分 ${s.rating}` : ""}`],
  };
}

function stayItem(s: StayView): Item {
  const f = s.food;
  return {
    id: s.poiId,
    name: s.name,
    city: s.city,
    lat: s.lat,
    lng: s.lng,
    score: s.score,
    gem: false,
    lines: [
      place(s.city, s.district, `酒店评分 ${s.rating}`),
      f.count === 0
        ? `${FOOD_RADIUS / 1000}km 内没有餐馆`
        : f.avg === null
          ? `${FOOD_RADIUS / 1000}km 内餐馆 ${f.count} 家，都还没有评分`
        : `${FOOD_RADIUS / 1000}km 内餐馆 ${f.count} 家 · 最近 25 家均分 ${f.avg.toFixed(1)}，${GOOD_FOOD} 分以上 ${f.good} 家`,
      s.nearest ? `离最近景点 ${s.nearest.km} km（${s.nearest.name}）` : "50km 内没有已扫描的景点",
    ],
  };
}

export default function Explore() {
  const [mode, setMode] = useState<Mode>("spots");
  const m = MODES[mode];
  const { data, error, mutate } = useApi<ExploreData<Spot | StayView>>(mode === "stays" ? "/api/explore?kind=stays" : "/api/explore");
  const scan = useAsync();
  const [scanning, setScanning] = useState<string | null>(null);
  const [city, setCity] = useState("all");
  const [minScore, setMinScore] = useState(0);
  const [gemsOnly, setGemsOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  // Scans burn 高德 quota, so every scan goes through a confirm dialog.
  const [confirming, setConfirming] = useState<City | null>(null);

  const scanned = useMemo(() => data?.regions.flatMap((r) => r.cities).filter((c) => c.fetchedAt) ?? [], [data]);
  const items = useMemo(
    () =>
      (data?.items ?? [])
        .map((x) => (mode === "stays" ? stayItem(x as StayView) : spotItem(x as Spot)))
        .filter((x) => (city === "all" || x.city === city) && x.score >= minScore && (mode !== "spots" || !gemsOnly || x.gem))
        .sort((a, b) => b.score - a.score),
    [data, mode, city, minScore, gemsOnly],
  );
  const points = useMemo(() => items.map((x) => ({ id: x.id, lat: x.lat, lng: x.lng, score: x.score, label: `${x.name} · ${m.scoreName} ${x.score}` })), [items, m]);

  const current = scanned.find((c) => c.name === city);
  const runScan = (target: City) =>
    scan.run(async () => {
      setScanning(target.name);
      try {
        await api("POST", "/api/explore/scan", { adcode: target.adcode, force: !!target.fetchedAt, kind: mode });
        await mutate();
        setCity(target.name);
      } finally {
        setScanning(null);
      }
    });

  const switchMode = (next: Mode) => {
    setMode(next);
    setSelected(null);
    setMinScore(0);
  };

  // Keep the picked place's card in view when it was chosen on the map.
  useEffect(() => {
    if (selected) document.getElementById(`place-${selected}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selected]);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16">
      <PageHeader title="找人少的地方" back="/" />

      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl border border-line bg-card p-1" role="tablist">
        {(Object.keys(MODES) as Mode[]).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={mode === k}
            disabled={scan.busy}
            onClick={() => switchMode(k)}
            className={`h-9 rounded-lg text-sm font-medium transition disabled:opacity-50 ${mode === k ? "bg-accent text-accent-fg" : "text-muted hover:bg-bg"}`}
          >
            {MODES[k].tab}
          </button>
        ))}
      </div>

      <Card className="space-y-3 p-4">
        <p className="text-sm text-muted">{m.intro}</p>
        {data?.regions.map((r) => (
          <div key={r.province}>
            <h2 className="mb-1.5 text-sm font-medium">{r.province}</h2>
            <div className="flex flex-wrap gap-1.5">
              {r.cities.map((c) => (
                <button
                  key={c.adcode}
                  disabled={scan.busy}
                  onClick={() => (c.fetchedAt ? setCity(c.name) : setConfirming(c))}
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
          <button disabled={scan.busy} onClick={() => setConfirming(current)} className="text-sm text-accent hover:underline disabled:opacity-50">
            ↻ 重新扫描{current.name}
            {current.fetchedAt && <span className="text-muted">（上次 {new Date(current.fetchedAt).toLocaleDateString()}）</span>}
          </button>
        )}
        {scanning && <p className="text-sm text-accent">正在扫描{scanning}的{m.tab}，{m.cost.split("，")[0]}…</p>}
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
              <span className="text-xs text-muted">
                {m.scoreName} ≥ {minScore}
              </span>
              <input type="range" min={0} max={90} step={10} value={minScore} onChange={(e) => setMinScore(+e.target.value)} className="w-full accent-[var(--accent)]" />
            </label>
            {mode === "spots" && (
              <label className="flex h-9 items-center gap-1.5 text-sm">
                <input type="checkbox" checked={gemsOnly} onChange={(e) => setGemsOnly(e.target.checked)} />
                只看宝藏 💎
              </label>
            )}
          </div>

          <div className="mt-3">
            <SpotMap points={points} selected={selected} onSelect={setSelected} />
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
              <Legend q={80} label={m.legend[0]} />
              <Legend q={50} label={m.legend[1]} />
              <Legend q={0} label={m.legend[2]} />
              {mode === "spots" && <span className="whitespace-nowrap sm:ml-auto">💎 = 冷门且评分 ≥4.5</span>}
            </p>
          </div>

          <p className="mt-4 text-sm text-muted">
            {items.length} {m.noun}
            {items.length > LIST_LIMIT && `，列出前 ${LIST_LIMIT} 个`}
          </p>
          <div className="mt-2 space-y-2">
            {items.slice(0, LIST_LIMIT).map((x) => (
              <PlaceCard key={x.id} item={x} scoreName={m.scoreName} selected={x.id === selected} onSelect={() => setSelected(x.id)} />
            ))}
          </div>
        </>
      )}

      <Sheet
        open={!!confirming}
        onClose={() => setConfirming(null)}
        title={`${confirming?.fetchedAt ? "重新扫描" : "扫描"}${confirming?.name ?? ""}的${m.tab}？`}
      >
        {confirming && (
          <div className="space-y-4">
            <div className="space-y-1.5 text-sm text-muted">
              {confirming.fetchedAt && <p>上次扫描：{new Date(confirming.fetchedAt).toLocaleDateString()}。重新扫描会用新结果覆盖它。</p>}
              <p>{m.cost}，占用当天的免费额度。</p>
              <p>为了保护额度，页面上每小时最多扫 6 次，全站每天最多 20 次。</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setConfirming(null)}>
                取消
              </Button>
              <Button
                onClick={() => {
                  runScan(confirming);
                  setConfirming(null);
                }}
              >
                开始扫描
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </main>
  );
}

function Legend({ q, label }: { q: number; label: string }) {
  return (
    <span className="flex items-center gap-1 whitespace-nowrap">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: scoreColor(q) }} />
      {label}
    </span>
  );
}

function PlaceCard({ item: x, scoreName, selected, onSelect }: { item: Item; scoreName: string; selected: boolean; onSelect: () => void }) {
  const amap = `https://uri.amap.com/marker?position=${x.lng},${x.lat}&name=${encodeURIComponent(x.name)}&src=travel-discuss&coordinate=gaode&callnative=1`;

  return (
    <div id={`place-${x.id}`} onClick={onSelect}>
      <Card className={`cursor-pointer p-3 ${selected ? "border-accent ring-2 ring-accent/20" : ""}`}>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl text-white" style={{ background: scoreColor(x.score) }}>
            <span className="text-base font-bold leading-none">{x.score}</span>
            <span className="text-[10px] leading-none opacity-90">{scoreName}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {x.name} {x.gem && "💎"}
            </p>
            {x.lines.map((line, i) => (
              <p key={i} className={`text-xs text-muted ${i === 0 ? "truncate" : "mt-0.5"}`}>
                {line}
              </p>
            ))}
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
