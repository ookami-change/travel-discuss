import { z } from "zod";
import { trafficAround } from "@/lib/amap";
import { ok, route } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/ratelimit";

const query = z.object({ lng: z.coerce.number().min(73).max(136), lat: z.coerce.number().min(3).max(54) });

/** Live congestion near a spot — a same-day "is it busy right now" check. */
export const GET = route(async (req) => {
  rateLimit(`explore-traffic:${clientIp(req)}`, 30, 60 * 1000);
  const { lng, lat } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  return ok(await trafficAround(lng, lat));
});
