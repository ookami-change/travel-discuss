import { db } from "@/db";
import { spotScans } from "@/db/schema";
import { REGIONS } from "@/lib/explore";
import { ok, route } from "@/lib/http";

/** Every cached city scan, for the 冷门景点 map. */
export const GET = route(async () => {
  const rows = await db.select().from(spotScans);
  const fetched = new Map(rows.map((r) => [r.adcode, r.fetchedAt]));
  return ok({
    regions: REGIONS.map((r) => ({
      province: r.province,
      cities: r.cities.map(([adcode, name]) => ({ adcode, name, fetchedAt: fetched.get(adcode) ?? null })),
    })),
    spots: rows.flatMap((r) => r.spots),
  });
});
