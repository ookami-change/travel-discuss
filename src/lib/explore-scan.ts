import { amenityCount, scenicPois } from "./amap";
import { AMENITY_RADIUS, CITY_NAMES, SPOTS_PER_CITY, quietScore, type Spot } from "./explore";

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

/** Hits 高德 ~SPOTS_PER_CITY × 1.04 times. */
export async function scanCity(adcode: string): Promise<Spot[]> {
  const city = CITY_NAMES.get(adcode);
  if (!city) throw new Error(`unknown adcode ${adcode}`);
  const pois = await scenicPois(adcode, SPOTS_PER_CITY);
  // Same POI can come back twice across pages when 高德 re-ranks mid-scan.
  const unique = [...new Map(pois.map((p) => [p.poiId, p])).values()];
  return mapLimit(unique, 3, async (p) => {
    const amenities = await amenityCount(p.lng, p.lat, AMENITY_RADIUS);
    return { ...p, city, amenities, quiet: quietScore(amenities, p.typecode) };
  });
}
