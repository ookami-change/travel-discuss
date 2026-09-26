import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { aiDrafts, suggestions } from "@/db/schema";
import { requireMember } from "@/lib/auth";
import { emit } from "@/lib/events";
import { badRequest, body, ok, route } from "@/lib/http";
import { planSnapshot } from "@/lib/validation";

/** Hand-edit a ready draft before anyone adopts it. The whole snapshot is replaced. */
export const PATCH = route(async (req, ctx: RouteContext<"/api/trips/[id]/plan/drafts/[draftId]">) => {
  const { id, draftId } = await ctx.params;
  const me = await requireMember(id);
  const { snapshot } = await body(req, z.object({ snapshot: planSnapshot }));
  // Only keep links to this trip's own suggestions; applySnapshot writes them straight through.
  const known = new Set((await db.select({ id: suggestions.id }).from(suggestions).where(eq(suggestions.tripId, id))).map((s) => s.id));
  for (const day of snapshot.days) for (const it of day.items) if (it.suggestionId && !known.has(it.suggestionId)) it.suggestionId = null;
  const [row] = await db
    .update(aiDrafts)
    .set({ snapshot, editedBy: me.id })
    .where(and(eq(aiDrafts.id, draftId), eq(aiDrafts.tripId, id), eq(aiDrafts.status, "ready")))
    .returning({ id: aiDrafts.id });
  if (!row) throw badRequest("这份方案已经被采纳或放弃了");
  emit(id, "plan");
  return ok();
});
