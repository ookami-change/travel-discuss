import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { spotScans, stayScans } from "@/db/schema";
import { sha256 } from "@/lib/crypto";
import { CITY_NAMES, SCAN_TTL_MS, SCAN_VERSION, STAY_VERSION } from "@/lib/explore";
import { scanCity, scanStays } from "@/lib/explore-scan";
import { badRequest, body, ok, route } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/ratelimit";

const inflight = new Map<string, Promise<number>>();

/** Bulk pre-scans on the server send EXPLORE_ADMIN_TOKEN and skip the rate limits. */
function isAdmin(req: Request) {
  const want = process.env.EXPLORE_ADMIN_TOKEN;
  const got = req.headers.get("x-admin-token");
  return !!want && !!got && sha256(got) === sha256(want);
}

async function cachedScan(kind: "spots" | "stays", adcode: string) {
  const table = kind === "spots" ? spotScans : stayScans;
  const [row] = await db.select({ version: table.version, fetchedAt: table.fetchedAt }).from(table).where(eq(table.adcode, adcode));
  return row;
}

/** Scans and stores; resolves to the number of places found. */
async function scanAndSave(kind: "spots" | "stays", adcode: string): Promise<number> {
  if (kind === "spots") {
    const spots = await scanCity(adcode);
    const set = { spots, version: SCAN_VERSION, fetchedAt: new Date() };
    await db.insert(spotScans).values({ adcode, ...set }).onConflictDoUpdate({ target: spotScans.adcode, set });
    return spots.length;
  }
  const stays = await scanStays(adcode);
  const set = { stays, version: STAY_VERSION, fetchedAt: new Date() };
  await db.insert(stayScans).values({ adcode, ...set }).onConflictDoUpdate({ target: stayScans.adcode, set });
  return stays.length;
}

/**
 * Scans a city unless a fresh, current-version scan exists (or `force`). A 冷门景点 scan costs ~200 高德 calls and a
 * 休闲好去处 scan ~90, hence the tight limits (shared by both kinds).
 */
export const POST = route(async (req) => {
  const { adcode, force, kind } = await body(
    req,
    z.object({ adcode: z.string(), force: z.boolean().optional(), kind: z.enum(["spots", "stays"]).default("spots") }),
  );
  if (!CITY_NAMES.has(adcode)) throw badRequest("不支持的城市");

  const cached = await cachedScan(kind, adcode);
  const version = kind === "spots" ? SCAN_VERSION : STAY_VERSION;
  if (!force && cached && cached.version === version && Date.now() - cached.fetchedAt.getTime() < SCAN_TTL_MS) {
    return ok({ count: null, cached: true });
  }

  const key = `${kind}:${adcode}`;
  let scan = inflight.get(key);
  if (!scan) {
    if (!isAdmin(req)) {
      rateLimit(`explore-scan:${clientIp(req)}`, 6, 3600 * 1000);
      rateLimit("explore-scan:all", 20, 24 * 3600 * 1000);
    }
    scan = scanAndSave(kind, adcode).finally(() => inflight.delete(key));
    inflight.set(key, scan);
  }
  return ok({ count: await scan, cached: false });
});
