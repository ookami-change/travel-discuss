import { eq } from "drizzle-orm";
import { z } from "zod";
import { planDays } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireMember } from "@/lib/auth";
import { emit } from "@/lib/events";
import { badRequest, body, ok, route } from "@/lib/http";
import { editPlan } from "@/lib/plan";
import { optText } from "@/lib/validation";

export const POST = route(async (req, ctx: RouteContext<"/api/trips/[id]/plan/days">) => {
  const { id } = await ctx.params;
  const me = await requireMember(id);
  const input = await body(req, z.object({ title: optText(100) }));
  const day = await editPlan(id, me.id, async (tx) => {
    const existing = await tx.select({ position: planDays.position }).from(planDays).where(eq(planDays.tripId, id));
    if (existing.length >= 60) throw badRequest("最多 60 天");
    const top = Math.max(0, ...existing.map((d) => d.position));
    const [day] = await tx.insert(planDays).values({ tripId: id, position: top + 1, title: input.title }).returning();
    await logActivity(tx, id, me.id, `${me.nickname} 添加了第 ${existing.length + 1} 天`);
    return day;
  });
  emit(id, "plan");
  return ok(day);
});
