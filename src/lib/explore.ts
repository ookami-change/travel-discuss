import type { ScenicPoi } from "./amap";

export const REGIONS = [
  {
    province: "广东",
    cities: [
      ["440100", "广州"], ["440200", "韶关"], ["440300", "深圳"], ["440400", "珠海"], ["440500", "汕头"], ["440600", "佛山"],
      ["440700", "江门"], ["440800", "湛江"], ["440900", "茂名"], ["441200", "肇庆"], ["441300", "惠州"], ["441400", "梅州"],
      ["441500", "汕尾"], ["441600", "河源"], ["441700", "阳江"], ["441800", "清远"], ["441900", "东莞"], ["442000", "中山"],
      ["445100", "潮州"], ["445200", "揭阳"], ["445300", "云浮"],
    ],
  },
  {
    province: "广西",
    cities: [
      ["450100", "南宁"], ["450200", "柳州"], ["450300", "桂林"], ["450400", "梧州"], ["450500", "北海"], ["450600", "防城港"],
      ["450700", "钦州"], ["450800", "贵港"], ["450900", "玉林"], ["451000", "百色"], ["451081", "靖西"], ["451100", "贺州"], ["451200", "河池"],
      ["451300", "来宾"], ["451400", "崇左"],
    ],
  },
] as const satisfies { province: string; cities: [string, string][] }[];

export const CITY_NAMES: ReadonlyMap<string, string> = new Map(REGIONS.flatMap((r) => r.cities.map(([code, name]) => [code, name] as const)));

/** Bump when scanCity starts collecting different spots, so older scans show as 旧. */
export const SCAN_VERSION = 2;
export const AMENITY_RADIUS = 1500;
export const SCAN_TTL_MS = 30 * 24 * 3600 * 1000;

export type Spot = ScenicPoi & {
  city: string;
  /** 餐饮 + 住宿 POIs within AMENITY_RADIUS. */
  amenities: number;
  /** 0 (挤) – 100 (冷门). */
  quiet: number;
};

/** 高德 subtype codes for rated sights (世界遗产 / 国家级 / 省级), which draw crowds beyond what nearby amenities suggest. */
const FAME_PENALTY: Record<string, number> = { "110201": 75, "110202": 30, "110203": 15 };

/**
 * 冷门度. Nearby 餐饮/住宿 count is the main signal (more amenities ⇒ more visitors), on a log scale so
 * 0 → 100, 10 → ~68, 50 → ~31, 150+ → ~0; famous-sight subtypes are docked on top.
 */
export function quietScore(amenities: number, typecode: string): number {
  const base = 100 - 20 * Math.log2(1 + Math.max(0, amenities) / 5);
  // Typecodes can be compound ("110210|110202"); take the biggest penalty.
  const penalty = Math.max(0, ...typecode.split("|").map((c) => FAME_PENALTY[c] ?? 0));
  return Math.round(Math.min(100, Math.max(0, base - penalty)));
}

/** 冷门 and well rated — worth the detour. */
export const isHiddenGem = (s: Pick<Spot, "quiet" | "rating">) => s.quiet >= 60 && (s.rating ?? 0) >= 4.5;

// ---- 休闲好去处: well-rated hotels with good food nearby, away from scenic spots ----

/** Bump when scanStays starts collecting different data. */
export const STAY_VERSION = 1;
export const FOOD_RADIUS = 1000;
/** 高德 rates restaurants low (3–4 is typical), so 4.0 already means good. */
export const GOOD_FOOD = 4;

export type Stay = Omit<ScenicPoi, "rating"> & {
  city: string;
  rating: number;
  food: {
    /** All 餐饮 POIs within FOOD_RADIUS. */
    count: number;
    /** Mean rating of the rated ones among the ~25 nearest; null when none are rated. */
    avg: number | null;
    /** How many of the ~25 nearest rate ≥ GOOD_FOOD. */
    good: number;
  };
};

/** Nearest scenic spot, filled in on read from whatever spot scans exist. */
export type StayView = Stay & { nearest: { name: string; km: number } | null; score: number };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * 休闲指数 0–100: 酒店评分 30% (4.0 → 0, 5.0 → full), 周边美食 35% (half mean rating 3.0 → 4.2,
 * half count of ≥4.0 places up to 5), 离景点 35% (0 km → 0, 8 km+ → full; unknown counts as half).
 */
export function stayScore(s: Pick<Stay, "rating" | "food">, nearestKm: number | null): number {
  const hotel = clamp01(s.rating - 4);
  const food = s.food.avg === null ? 0 : 0.5 * clamp01((s.food.avg - 3) / 1.2) + 0.5 * Math.min(s.food.good / 5, 1);
  const far = nearestKm === null ? 0.5 : clamp01(nearestKm / 8);
  return Math.round(100 * (0.3 * hotel + 0.35 * food + 0.35 * far));
}

export function distanceKm(a: { lng: number; lat: number }, b: { lng: number; lat: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** "茶瀑布(糖厂街店)": a shop chain branch that 高德 files under 风景名胜. */
export const isShopBranch = (name: string) => /店[)）]$/.test(name);

/**
 * Sights that actually draw visitors, for 休闲好去处's distance: 风景名胜 (1102xx; city parks are everywhere) rated 4.0+.
 * Half of 1102xx is 寺庙道观, mostly village shrines, so temples count only from 4.5.
 */
export function isAttraction(s: Pick<Spot, "typecode" | "rating" | "name">) {
  const main = s.typecode.split("|")[0];
  if (!main.startsWith("1102") || isShopBranch(s.name)) return false;
  return (s.rating ?? 0) >= (main === "110205" ? 4.5 : 4);
}

/** Nearest of `targets` to each point, searching only a latitude band (targets sorted by lat) since results are ≤ maxKm. */
export function nearestWithin<T extends { lng: number; lat: number }>(points: { lng: number; lat: number }[], targets: T[], maxKm = 50) {
  const sorted = [...targets].sort((a, b) => a.lat - b.lat);
  const band = maxKm / 111;
  return points.map((p) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid].lat < p.lat - band) lo = mid + 1;
      else hi = mid;
    }
    let best: { target: T; km: number } | null = null;
    for (let i = lo; i < sorted.length && sorted[i].lat <= p.lat + band; i++) {
      const km = distanceKm(p, sorted[i]);
      if (km <= maxKm && (!best || km < best.km)) best = { target: sorted[i], km };
    }
    return best;
  });
}
