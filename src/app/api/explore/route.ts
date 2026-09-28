import { asc } from "drizzle-orm";
import { db } from "@/db";
import { spotScans } from "@/db/schema";
import { quietScore, REGIONS, SCAN_VERSION, type Spot } from "@/lib/explore";
import { ok, route } from "@/lib/http";

/** Every cached city scan, for the 冷门景点 map. */
export const GET = route(async () => {
  const rows = await db.select().from(spotScans).orderBy(asc(spotScans.fetchedAt));
  const byCode = new Map(rows.map((r) => [r.adcode, r]));
  // A county (靖西) overlaps its city (百色): keep one copy per POI, preferring the county scan, then the newest.
  const isCounty = (adcode: string) => !adcode.endsWith("00");
  const ordered = [...rows].sort((a, b) => Number(isCounty(a.adcode)) - Number(isCounty(b.adcode)));
  const spots = new Map<string, Spot>();
  for (const r of ordered) for (const s of r.spots) spots.set(s.poiId, s);
  return ok({
    regions: REGIONS.map((r) => ({
      province: r.province,
      cities: r.cities.map(([adcode, name]) => {
        const row = byCode.get(adcode);
        return { adcode, name, fetchedAt: row?.fetchedAt ?? null, stale: !!row && row.version < SCAN_VERSION };
      }),
    })),
    // Re-score on read so tuning quietScore doesn't need a rescan.
    spots: [...spots.values()].map((s) => ({ ...s, quiet: quietScore(s.amenities, s.typecode) })),
  });
});
