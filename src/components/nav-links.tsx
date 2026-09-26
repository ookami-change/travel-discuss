type Target = { title: string; address?: string | null; lng?: number | null; lat?: number | null };

/** Deep links into 高德 / Apple Maps. Coordinates are GCJ-02, which both use in mainland China. */
export function mapLinks(t: Target, city?: string | null) {
  const name = encodeURIComponent(t.title);
  const hasLoc = t.lng != null && t.lat != null;
  const amap = hasLoc
    ? `https://uri.amap.com/navigation?to=${t.lng},${t.lat},${name}&mode=car&coordinate=gaode&callnative=1`
    : `https://uri.amap.com/search?keyword=${encodeURIComponent(t.address || t.title)}${city ? `&city=${encodeURIComponent(city)}` : ""}&callnative=1`;
  const apple = hasLoc
    ? `https://maps.apple.com/?daddr=${t.lat},${t.lng}&q=${name}`
    : `https://maps.apple.com/?q=${encodeURIComponent([t.title, t.address].filter(Boolean).join(" "))}`;
  return { amap, apple };
}

export function NavLinks({ target, city, compact }: { target: Target; city?: string | null; compact?: boolean }) {
  const { amap, apple } = mapLinks(target, city);
  const cls = compact
    ? "rounded-lg border border-line px-2.5 py-1 text-xs text-accent"
    : "flex h-11 flex-1 items-center justify-center rounded-xl bg-accent font-medium text-accent-fg";
  return (
    <div className="flex gap-2">
      <a href={amap} target="_blank" rel="noreferrer" className={cls}>
        {compact ? "高德" : "🧭 高德导航"}
      </a>
      <a
        href={apple}
        target="_blank"
        rel="noreferrer"
        className={compact ? cls : "flex h-11 items-center justify-center rounded-xl border border-line bg-card px-4 text-fg"}
      >
        {compact ? "苹果地图" : "苹果地图"}
      </a>
    </div>
  );
}
