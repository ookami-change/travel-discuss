import { z } from "zod";
import { planItems } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireMember } from "@/lib/auth";
import { emit } from "@/lib/events";
import { body, ok, route } from "@/lib/http";
import { assertSuggestion, editPlan, findDay, itemsOfDay } from "@/lib/plan";
import { itemInput } from "@/lib/validation";

export const POST = route(async (req, ctx: RouteContext<"/api/trips/[id]/plan/items">) => {
  const { id } = await ctx.params;
  const me = await requireMember(id);
  const input = await body(req, itemInput.extend({ dayId: z.string().uuid() }));
  const item = await editPlan(id, me.id, async (tx) => {
    await findDay(tx, id, input.dayId);
    await assertSuggestion(tx, id, input.suggestionId);
    const siblings = await itemsOfDay(tx, input.dayId);
    const top = Math.max(0, ...siblings.map((i) => i.position));
    const [item] = await tx
      .insert(planItems)
      .values({ ...input, tripId: id, position: top + 1, updatedBy: me.id })
      .returning();
    await logActivity(tx, id, me.id, `${me.nickname} 把「${item.title}」加入了行程`);
    return item;
  });
  emit(id, "plan", "suggestions");
  return ok(item);
});
