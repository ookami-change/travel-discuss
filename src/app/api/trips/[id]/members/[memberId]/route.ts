import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { members, sessions } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireAdmin } from "@/lib/auth";
import { emit } from "@/lib/events";
import { badRequest, notFound, ok, route } from "@/lib/http";

export const DELETE = route(async (_req, ctx: RouteContext<"/api/trips/[id]/members/[memberId]">) => {
  const { id, memberId } = await ctx.params;
  const me = await requireAdmin(id);
  if (memberId === me.id) throw badRequest("不能移除自己");
  await db.transaction(async (tx) => {
    const [m] = await tx
      .update(members)
      .set({ removedAt: new Date() })
      .where(and(eq(members.id, memberId), eq(members.tripId, id), isNull(members.removedAt)))
      .returning();
    if (!m) throw notFound("成员不存在");
    await tx.delete(sessions).where(eq(sessions.memberId, m.id));
    await logActivity(tx, id, me.id, `${me.nickname} 移除了 ${m.nickname}`);
  });
  emit(id, "members");
  return ok();
});
