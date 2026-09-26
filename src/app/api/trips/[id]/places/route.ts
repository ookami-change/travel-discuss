import { eq } from "drizzle-orm";
import { db } from "@/db";
import { trips } from "@/db/schema";
import { searchPlaces } from "@/lib/amap";
import { requireMember } from "@/lib/auth";
import { ok, route } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

export const GET = route(async (req, ctx: RouteContext<"/api/trips/[id]/places">) => {
  const { id } = await ctx.params;
  const me = await requireMember(id);
  rateLimit(`places:${me.id}`, 60, 60 * 1000);
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return ok([]);
  const [trip] = await db.select({ destination: trips.destination }).from(trips).where(eq(trips.id, id));
  return ok(await searchPlaces(q.slice(0, 50), trip?.destination));
});
