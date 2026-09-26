import { z } from "zod";
import { db } from "@/db";
import { recoverMember, startSession, tripByInvite } from "@/lib/auth";
import { body, ok, route } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { nickname, pin } from "@/lib/validation";

export const POST = route(async (req, ctx: RouteContext<"/api/invite/[code]/recover">) => {
  rateLimit(`recover:${clientIp(req)}`, 20, 10 * 60 * 1000);
  const { code } = await ctx.params;
  const trip = await tripByInvite(code);
  const input = await body(req, z.object({ nickname, pin }));
  const m = await recoverMember(trip.id, input.nickname, input.pin);
  await db.transaction((tx) => startSession(tx, m));
  return ok({ id: trip.id });
});
