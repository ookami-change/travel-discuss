import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { expenses } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireMember } from "@/lib/auth";
import { emit } from "@/lib/events";
import { forbidden, notFound, ok, route } from "@/lib/http";

export const DELETE = route(async (_req, ctx: RouteContext<"/api/trips/[id]/expenses/[expenseId]">) => {
  const { id, expenseId } = await ctx.params;
  const me = await requireMember(id);
  const [e] = await db.select().from(expenses).where(and(eq(expenses.id, expenseId), eq(expenses.tripId, id)));
  if (!e) throw notFound("记录不存在");
  if (e.createdBy !== me.id && !me.isAdmin) throw forbidden("只能删除自己记的账");
  await db.delete(expenses).where(eq(expenses.id, e.id));
  await logActivity(db, id, me.id, `${me.nickname} 删除了一笔账：${e.title}`);
  emit(id, "expenses");
  return ok();
});
