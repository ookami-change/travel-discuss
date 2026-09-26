import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiDrafts } from "@/db/schema";
import { requireMember } from "@/lib/auth";
import { emit } from "@/lib/events";
import { ok, route } from "@/lib/http";

export const POST = route(async (_req, ctx: RouteContext<"/api/trips/[id]/plan/drafts/[draftId]/discard">) => {
  const { id, draftId } = await ctx.params;
  await requireMember(id);
  await db
    .update(aiDrafts)
    .set({ status: "discarded" })
    .where(and(eq(aiDrafts.id, draftId), eq(aiDrafts.tripId, id), eq(aiDrafts.status, "ready")));
  emit(id, "plan");
  return ok();
});
