import { asc } from "drizzle-orm";
import { db } from "@/db";
import { spotScans, stayScans } from "@/db/schema";
import { isScenic, nearestWithin, quietScore, REGIONS, SCAN_VERSION, STAY_VERSION, stayScore, type Spot, type StayView } from "@/lib/explore";
import { ok, route } from "@/lib/http";

const regionsWith = (rows: { adcode: string; fetchedAt: Date; version: number }[], version: number) => {
  const byCode = new Map(rows.map((r) => [r.adcode, r]));
  return REGIONS.map((r) => ({
    province: r.province,
    cities: r.cities.map(([adcode, name]) => {
      const row = byCode.get(adcode);
      return { adcode, name, fetchedAt: row?.fetchedAt ?? null, stale: !!row && row.version < version };
    }),
  }));
};

async function allSpots() {
  const rows = await db.select().from(spotScans).orderBy(asc(spotScans.fetchedAt));
  // A county (靖西) overlaps its city (百色): keep one copy per POI, preferring the county scan, then the newest.
  const isCounty = (adcode: string) => !adcode.endsWith("00");
  const ordered = [...rows].sort((a, b) => Number(isCounty(a.adcode)) - Number(isCounty(b.adcode)));
  const spots = new Map<string, Spot>();
  for (const r of ordered) for (const s of r.spots) spots.set(s.poiId, s);
  return { rows, spots: [...spots.values()] };
}

/** Every cached city scan for the explore map: 冷门景点 (default) or 休闲好去处 (?kind=stays). */
export const GET = route(async (req) => {
  const { rows: spotRows, spots } = await allSpots();

  if (new URL(req.url).searchParams.get("kind") === "stays") {
    const rows = await db.select().from(stayScans);
    const stays = new Map(rows.flatMap((r) => r.stays).map((s) => [s.poiId, s]));
    // Distance to scenic spots is computed on read, so it improves as more cities get scanned.
    const list = [...stays.values()];
    const nearest = nearestWithin(list, spots.filter(isScenic));
    const items: StayView[] = list.map((s, i) => {
      const n = nearest[i];
      return { ...s, nearest: n && { name: n.target.name, km: Math.round(n.km * 10) / 10 }, score: stayScore(s, n?.km ?? null) };
    });
    return ok({ regions: regionsWith(rows, STAY_VERSION), items });
  }

  return ok({
    regions: regionsWith(spotRows, SCAN_VERSION),
    // Re-score on read so tuning quietScore doesn't need a rescan.
    items: spots.map((s) => ({ ...s, quiet: quietScore(s.amenities, s.typecode) })),
  });
});
