import { z } from "zod";
import { planItems } from "@/db/schema";
import { requireMember } from "@/lib/auth";
import { emit } from "@/lib/events";
import { body, ok, route } from "@/lib/http";
import { editPlan, findItem, itemsOfDay, renumber, shift } from "@/lib/plan";

export const POST = route(async (req, ctx: RouteContext<"/api/trips/[id]/plan/items/[itemId]/move">) => {
  const { id, itemId } = await ctx.params;
  const me = await requireMember(id);
  const { direction } = await body(req, z.object({ direction: z.enum(["up", "down"]) }));
  await editPlan(id, me.id, async (tx) => {
    const item = await findItem(tx, id, itemId);
    const order = shift((await itemsOfDay(tx, item.dayId)).map((i) => i.id), itemId, direction);
    if (order) await renumber(tx, planItems, order);
  });
  emit(id, "plan");
  return ok();
});
