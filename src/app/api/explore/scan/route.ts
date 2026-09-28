import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { spotScans } from "@/db/schema";
import { CITY_NAMES, SCAN_TTL_MS, SCAN_VERSION, type Spot } from "@/lib/explore";
import { scanCity } from "@/lib/explore-scan";
import { sha256 } from "@/lib/crypto";
import { badRequest, body, ok, route } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/ratelimit";

const inflight = new Map<string, Promise<Spot[]>>();

/** Bulk pre-scans on the server send EXPLORE_ADMIN_TOKEN and skip the rate limits. */
function isAdmin(req: Request) {
  const want = process.env.EXPLORE_ADMIN_TOKEN;
  const got = req.headers.get("x-admin-token");
  return !!want && !!got && sha256(got) === sha256(want);
}

/** Scans a city unless a fresh, current-version scan exists (or `force`). Each scan costs ~200 高德 calls, hence the tight limits. */
export const POST = route(async (req) => {
  const { adcode, force } = await body(req, z.object({ adcode: z.string(), force: z.boolean().optional() }));
  if (!CITY_NAMES.has(adcode)) throw badRequest("不支持的城市");

  const [cached] = await db.select().from(spotScans).where(eq(spotScans.adcode, adcode));
  if (!force && cached && cached.version === SCAN_VERSION && Date.now() - cached.fetchedAt.getTime() < SCAN_TTL_MS) {
    return ok({ spots: cached.spots, cached: true });
  }

  let scan = inflight.get(adcode);
  if (!scan) {
    if (!isAdmin(req)) {
      rateLimit(`explore-scan:${clientIp(req)}`, 6, 3600 * 1000);
      rateLimit("explore-scan:all", 20, 24 * 3600 * 1000);
    }
    scan = scanCity(adcode).finally(() => inflight.delete(adcode));
    inflight.set(adcode, scan);
  }
  const spots = await scan;
  await db
    .insert(spotScans)
    .values({ adcode, spots, version: SCAN_VERSION })
    .onConflictDoUpdate({ target: spotScans.adcode, set: { spots, version: SCAN_VERSION, fetchedAt: new Date() } });
  return ok({ spots, cached: false });
});
