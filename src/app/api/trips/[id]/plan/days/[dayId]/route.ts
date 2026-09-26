import { eq } from "drizzle-orm";
import { z } from "zod";
import { planDays } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireMember } from "@/lib/auth";
import { emit } from "@/lib/events";
import { body, ok, route } from "@/lib/http";
import { editPlan, findDay } from "@/lib/plan";
import { lodging, optText } from "@/lib/validation";

type Ctx = RouteContext<"/api/trips/[id]/plan/days/[dayId]">;

export const PATCH = route(async (req, ctx: Ctx) => {
  const { id, dayId } = await ctx.params;
  const me = await requireMember(id);
  const input = await body(req, z.object({ title: optText(100).optional(), lodging: lodging.optional() }));
  await editPlan(id, me.id, async (tx) => {
    await findDay(tx, id, dayId);
    await tx.update(planDays).set({ ...input, updatedAt: new Date() }).where(eq(planDays.id, dayId));
    if (input.lodging !== undefined) {
      await logActivity(tx, id, me.id, input.lodging ? `${me.nickname} 设置住宿为「${input.lodging.name}」` : `${me.nickname} 清除了一晚的住宿`);
    }
  });
  emit(id, "plan");
  return ok();
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  const { id, dayId } = await ctx.params;
  const me = await requireMember(id);
  await editPlan(id, me.id, async (tx) => {
    await findDay(tx, id, dayId);
    await tx.delete(planDays).where(eq(planDays.id, dayId));
    await logActivity(tx, id, me.id, `${me.nickname} 删除了一天（可在历史版本中恢复）`);
  });
  emit(id, "plan", "media");
  return ok();
});
