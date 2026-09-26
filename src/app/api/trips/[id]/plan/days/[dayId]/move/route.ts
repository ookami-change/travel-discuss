import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { planDays } from "@/db/schema";
import { requireMember } from "@/lib/auth";
import { emit } from "@/lib/events";
import { body, ok, route } from "@/lib/http";
import { editPlan, findDay, renumber, shift } from "@/lib/plan";

export const POST = route(async (req, ctx: RouteContext<"/api/trips/[id]/plan/days/[dayId]/move">) => {
  const { id, dayId } = await ctx.params;
  const me = await requireMember(id);
  const { direction } = await body(req, z.object({ direction: z.enum(["up", "down"]) }));
  await editPlan(id, me.id, async (tx) => {
    await findDay(tx, id, dayId);
    const days = await tx.select({ id: planDays.id }).from(planDays).where(eq(planDays.tripId, id)).orderBy(asc(planDays.position));
    const order = shift(days.map((d) => d.id), dayId, direction);
    if (order) await renumber(tx, planDays, order);
  });
  emit(id, "plan");
  return ok();
});
