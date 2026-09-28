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
      ["450700", "钦州"], ["450800", "贵港"], ["450900", "玉林"], ["451000", "百色"], ["451100", "贺州"], ["451200", "河池"],
      ["451300", "来宾"], ["451400", "崇左"],
    ],
  },
] as const satisfies { province: string; cities: [string, string][] }[];

export const CITY_NAMES: ReadonlyMap<string, string> = new Map(REGIONS.flatMap((r) => r.cities.map(([code, name]) => [code, name] as const)));

/** Spots fetched per city: one POI page per 25, plus one 周边 lookup each. */
export const SPOTS_PER_CITY = 100;
export const AMENITY_RADIUS = 1500;
export const SCAN_TTL_MS = 30 * 24 * 3600 * 1000;

export type Spot = ScenicPoi & {
  city: string;
  /** 餐饮 + 住宿 POIs within AMENITY_RADIUS. */
  amenities: number;
  /** 0 (挤) – 100 (冷门). */
  quiet: number;
};

/** 高德 subtype codes for famous sights, which draw crowds beyond what nearby amenities suggest. */
const FAME_PENALTY: Record<string, number> = { "110201": 25, "110202": 15, "110203": 5 };

/**
 * 冷门度. Nearby 餐饮/住宿 count is the main signal (more amenities ⇒ more visitors), on a log scale so
 * 0 → 100, 10 → ~68, 50 → ~31, 150+ → ~0; famous-sight subtypes are docked on top.
 */
export function quietScore(amenities: number, typecode: string): number {
  const base = 100 - 20 * Math.log2(1 + Math.max(0, amenities) / 5);
  return Math.round(Math.min(100, Math.max(0, base - (FAME_PENALTY[typecode] ?? 0))));
}

/** 冷门 and well rated — worth the detour. */
export const isHiddenGem = (s: Pick<Spot, "quiet" | "rating">) => s.quiet >= 60 && (s.rating ?? 0) >= 4.5;
