import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { spotScans } from "@/db/schema";
import { CITY_NAMES, SCAN_TTL_MS, type Spot } from "@/lib/explore";
import { scanCity } from "@/lib/explore-scan";
import { badRequest, body, ok, route } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/ratelimit";

const inflight = new Map<string, Promise<Spot[]>>();

/** Scans a city unless a fresh cached scan exists. Each scan costs ~100 高德 calls, hence the tight limits. */
export const POST = route(async (req) => {
  const { adcode } = await body(req, z.object({ adcode: z.string() }));
  if (!CITY_NAMES.has(adcode)) throw badRequest("不支持的城市");

  const [cached] = await db.select().from(spotScans).where(eq(spotScans.adcode, adcode));
  if (cached && Date.now() - cached.fetchedAt.getTime() < SCAN_TTL_MS) return ok({ spots: cached.spots, cached: true });

  let scan = inflight.get(adcode);
  if (!scan) {
    rateLimit(`explore-scan:${clientIp(req)}`, 6, 3600 * 1000);
    rateLimit("explore-scan:all", 20, 24 * 3600 * 1000);
    scan = scanCity(adcode).finally(() => inflight.delete(adcode));
    inflight.set(adcode, scan);
  }
  const spots = await scan;
  await db
    .insert(spotScans)
    .values({ adcode, spots })
    .onConflictDoUpdate({ target: spotScans.adcode, set: { spots, fetchedAt: new Date() } });
  return ok({ spots, cached: false });
});
