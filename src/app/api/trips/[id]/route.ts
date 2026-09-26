import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { members, trips } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireAdmin, requireMember } from "@/lib/auth";
import { emit } from "@/lib/events";
import { badRequest, body, ok, route } from "@/lib/http";
import { date, optText } from "@/lib/validation";

type Ctx = RouteContext<"/api/trips/[id]">;

export const GET = route(async (_req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const me = await requireMember(id);
  const [trip] = await db.select().from(trips).where(eq(trips.id, id));
  const list = await db
    .select({ id: members.id, nickname: members.nickname, isAdmin: members.isAdmin })
    .from(members)
    .where(and(eq(members.tripId, id), isNull(members.removedAt)))
    .orderBy(asc(members.createdAt));
  return ok({
    trip: { ...trip, inviteCode: trip.inviteCode },
    me: { id: me.id, nickname: me.nickname, isAdmin: me.isAdmin },
    members: list,
  });
});

export const PATCH = route(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const me = await requireAdmin(id);
  const input = await body(
    req,
    z.object({
      name: z.string().trim().min(1).max(50).optional(),
      destination: optText(50).optional(),
      startDate: date.nullable().optional(),
      endDate: date.nullable().optional(),
    }),
  );
  const [cur] = await db.select().from(trips).where(eq(trips.id, id));
  const start = input.startDate === undefined ? cur.startDate : input.startDate;
  const end = input.endDate === undefined ? cur.endDate : input.endDate;
  if (end && (!start || end < start)) throw badRequest("结束日期不能早于开始日期");
  await db.update(trips).set(input).where(eq(trips.id, id));
  await logActivity(db, id, me.id, `${me.nickname} 修改了旅行信息`);
  emit(id, "trip");
  return ok();
});
