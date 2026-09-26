import { eq } from "drizzle-orm";
import { z } from "zod";
import { planItems } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireMember } from "@/lib/auth";
import { emit } from "@/lib/events";
import { body, ok, route } from "@/lib/http";
import { assertSuggestion, editPlan, findDay, findItem, itemsOfDay } from "@/lib/plan";
import { itemInput } from "@/lib/validation";

type Ctx = RouteContext<"/api/trips/[id]/plan/items/[itemId]">;

/** Partial update; last write wins per field. Changing dayId appends to that day. */
export const PATCH = route(async (req, ctx: Ctx) => {
  const { id, itemId } = await ctx.params;
  const me = await requireMember(id);
  const input = await body(req, itemInput.partial().extend({ dayId: z.string().uuid().optional() }));
  const updated = await editPlan(id, me.id, async (tx) => {
    const item = await findItem(tx, id, itemId);
    await assertSuggestion(tx, id, input.suggestionId);
    let position = item.position;
    if (input.dayId && input.dayId !== item.dayId) {
      await findDay(tx, id, input.dayId);
      position = Math.max(0, ...(await itemsOfDay(tx, input.dayId)).map((i) => i.position)) + 1;
    }
    const [row] = await tx
      .update(planItems)
      .set({ ...input, position, updatedAt: new Date(), updatedBy: me.id })
      .where(eq(planItems.id, itemId))
      .returning();
    await logActivity(tx, id, me.id, `${me.nickname} 修改了「${row.title}」`);
    return row;
  });
  emit(id, "plan");
  return ok(updated);
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  const { id, itemId } = await ctx.params;
  const me = await requireMember(id);
  await editPlan(id, me.id, async (tx) => {
    const item = await findItem(tx, id, itemId);
    await tx.delete(planItems).where(eq(planItems.id, itemId));
    await logActivity(tx, id, me.id, `${me.nickname} 从行程中移除了「${item.title}」`);
  });
  emit(id, "plan", "suggestions", "media");
  return ok();
});
