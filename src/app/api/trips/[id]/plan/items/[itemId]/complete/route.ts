import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { planItems } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireMember } from "@/lib/auth";
import { emit } from "@/lib/events";
import { body, ok, route } from "@/lib/http";
import { findItem } from "@/lib/plan";

/** Check a stop off (or undo). Shared by the whole group: it moves everyone's "next stop". */
export const POST = route(async (req, ctx: RouteContext<"/api/trips/[id]/plan/items/[itemId]/complete">) => {
  const { id, itemId } = await ctx.params;
  const me = await requireMember(id);
  const { done } = await body(req, z.object({ done: z.boolean() }));
  await db.transaction(async (tx) => {
    const item = await findItem(tx, id, itemId);
    await tx
      .update(planItems)
      .set(done ? { completedAt: new Date(), completedBy: me.id } : { completedAt: null, completedBy: null })
      .where(eq(planItems.id, itemId));
    await logActivity(tx, id, me.id, done ? `${me.nickname} 打卡完成「${item.title}」` : `${me.nickname} 撤销了「${item.title}」的打卡`);
  });
  emit(id, "plan");
  return ok();
});
