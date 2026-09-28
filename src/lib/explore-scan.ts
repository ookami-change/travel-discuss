import { amenityCount, foodAround, searchPois, type ScenicPoi } from "./amap";
import { AMENITY_RADIUS, CITY_NAMES, distanceKm, FOOD_RADIUS, GOOD_FOOD, quietScore, type Spot, type Stay } from "./explore";

/** Where spots come from, each capped separately so city parks can't crowd out 风景名胜. */
const SOURCES: { query: { types?: string; keywords?: string }; max: number }[] = [
  { query: { types: "110200" }, max: 100 }, // 风景名胜 and its subtypes
  { query: { types: "110101|110103" }, max: 50 }, // 公园, 植物园
  // 自然保护区 etc. have no typecode of their own in 高德 — they sit under 风景名胜 / 公园.
  { query: { keywords: "自然保护区" }, max: 25 },
  { query: { keywords: "森林公园" }, max: 25 },
  { query: { keywords: "湿地公园" }, max: 25 },
];

/** 纪念馆 / 教堂 / 回教寺 / 动物园 / 水族馆 / 城市广场 — filed under 风景名胜 or 公园 but rarely a trip destination. */
const NOT_DESTINATION = new Set(["110204", "110206", "110207", "110102", "110104", "110105"]);

function isDestination(p: ScenicPoi) {
  const main = p.typecode.split("|")[0];
  // Keyword hits can be anything (a hotel named after the park); keep 风景名胜 (11xxxx) only.
  if (!main.startsWith("11") || NOT_DESTINATION.has(main)) return false;
  // "古龙山大峡谷-漂流" style entries are parts of a scenic area that is listed on its own.
  return !p.name.includes("-");
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Up to ~10 search pages plus one 周边 lookup per spot (~200 高德 calls, about a minute). */
export async function scanCity(adcode: string): Promise<Spot[]> {
  const city = CITY_NAMES.get(adcode);
  if (!city) throw new Error(`unknown adcode ${adcode}`);
  const pois: ScenicPoi[] = [];
  for (const src of SOURCES) pois.push(...(await searchPois(adcode, src.query, src.max)).filter(isDestination));
  // Sources overlap, and 高德 can repeat a POI across pages when it re-ranks mid-scan.
  const unique = [...new Map(pois.map((p) => [p.poiId, p])).values()];
  return mapLimit(unique, 3, async (p) => {
    const amenities = await amenityCount(p.lng, p.lat, AMENITY_RADIUS);
    return { ...p, city, amenities, quiet: quietScore(amenities, p.typecode) };
  });
}

const HOTEL_MIN_RATING = 4.5;
const MAX_STAYS = 80;
/** Hotels this close together are one 去处; keep the best rated. */
const SAME_PLACE_KM = 0.3;

/** Well-rated hotels in the city, then one nearby-food lookup each (~90 高德 calls). */
export async function scanStays(adcode: string): Promise<Stay[]> {
  const city = CITY_NAMES.get(adcode);
  if (!city) throw new Error(`unknown adcode ${adcode}`);
  const hotels = (await searchPois(adcode, { types: "100000" }, 200))
    .filter((p) => p.typecode.split("|")[0].startsWith("100") && (p.rating ?? 0) >= HOTEL_MIN_RATING)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  const picked: ScenicPoi[] = [];
  for (const h of hotels) {
    if (picked.length >= MAX_STAYS) break;
    if (!picked.some((p) => p.poiId === h.poiId || distanceKm(p, h) < SAME_PLACE_KM)) picked.push(h);
  }
  return mapLimit(picked, 3, async (h) => {
    const { count, ratings } = await foodAround(h.lng, h.lat, FOOD_RADIUS);
    const rated = ratings.filter((r) => r > 0);
    return {
      ...h,
      city,
      rating: h.rating ?? 0,
      food: {
        count,
        avg: rated.length ? Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 100) / 100 : null,
        good: rated.filter((r) => r >= GOOD_FOOD).length,
      },
    };
  });
}
