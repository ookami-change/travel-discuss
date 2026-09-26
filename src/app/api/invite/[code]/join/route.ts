import { z } from "zod";
import { db } from "@/db";
import { logActivity } from "@/lib/activity";
import { createMember, startSession, tripByInvite } from "@/lib/auth";
import { emit } from "@/lib/events";
import { body, ok, route } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { nickname, pin } from "@/lib/validation";

export const POST = route(async (req, ctx: RouteContext<"/api/invite/[code]/join">) => {
  rateLimit(`join:${clientIp(req)}`, 20, 10 * 60 * 1000);
  const { code } = await ctx.params;
  const trip = await tripByInvite(code);
  const input = await body(req, z.object({ nickname, pin }));
  await db.transaction(async (tx) => {
    const m = await createMember(tx, trip.id, input.nickname, input.pin);
    await logActivity(tx, trip.id, m.id, `${m.nickname} 加入了旅行`);
    await startSession(tx, m);
  });
  emit(trip.id, "members");
  return ok({ id: trip.id });
});
