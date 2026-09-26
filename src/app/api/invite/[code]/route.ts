import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { members } from "@/db/schema";
import { currentMember, tripByInvite } from "@/lib/auth";
import { ok, route } from "@/lib/http";

export const GET = route(async (_req, ctx: RouteContext<"/api/invite/[code]">) => {
  const { code } = await ctx.params;
  const trip = await tripByInvite(code);
  const list = await db
    .select({ nickname: members.nickname })
    .from(members)
    .where(and(eq(members.tripId, trip.id), isNull(members.removedAt)));
  const me = await currentMember(trip.id);
  return ok({
    trip: { id: trip.id, name: trip.name, destination: trip.destination, startDate: trip.startDate, endDate: trip.endDate },
    members: list.map((m) => m.nickname),
    alreadyMember: Boolean(me),
  });
});
