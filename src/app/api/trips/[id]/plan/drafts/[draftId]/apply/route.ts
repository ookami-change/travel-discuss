import { and, eq } from "drizzle-orm";
import { aiDrafts } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireMember } from "@/lib/auth";
import { emit } from "@/lib/events";
import { badRequest, notFound, ok, route } from "@/lib/http";
import { applySnapshot, editPlan, saveVersion } from "@/lib/plan";

/** Adopt an AI draft. The current plan is always saved as a version first. */
export const POST = route(async (_req, ctx: RouteContext<"/api/trips/[id]/plan/drafts/[draftId]/apply">) => {
  const { id, draftId } = await ctx.params;
  const me = await requireMember(id);
  await editPlan(id, me.id, async (tx) => {
    const [d] = await tx.select().from(aiDrafts).where(and(eq(aiDrafts.id, draftId), eq(aiDrafts.tripId, id)));
    if (!d) throw notFound("方案不存在");
    if (d.status !== "ready" || !d.snapshot) throw badRequest("这份方案已经处理过或还没生成好");
    await saveVersion(tx, id, me.id, d.mode === "adjust" ? "采纳 AI 调整前自动保存" : "采纳 AI 方案前自动保存");
    await applySnapshot(tx, id, d.snapshot, me.id);
    await tx.update(aiDrafts).set({ status: "applied" }).where(eq(aiDrafts.id, draftId));
    await logActivity(tx, id, me.id, `${me.nickname} 采纳了 AI ${d.mode === "adjust" ? "调整方案" : "候选方案"}${d.editedBy ? "（手动改过）" : ""}`);
  });
  emit(id, "plan", "suggestions", "media");
  return ok();
});
