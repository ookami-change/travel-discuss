import { and, eq } from "drizzle-orm";
import { planVersions } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireMember } from "@/lib/auth";
import { emit } from "@/lib/events";
import { notFound, ok, route } from "@/lib/http";
import { applySnapshot, editPlan, saveVersion } from "@/lib/plan";

export const POST = route(async (_req, ctx: RouteContext<"/api/trips/[id]/plan/versions/[versionId]/restore">) => {
  const { id, versionId } = await ctx.params;
  const me = await requireMember(id);
  await editPlan(id, me.id, async (tx) => {
    const [v] = await tx.select().from(planVersions).where(and(eq(planVersions.id, versionId), eq(planVersions.tripId, id)));
    if (!v) throw notFound("版本不存在");
    await saveVersion(tx, id, me.id, "回滚前自动保存");
    await applySnapshot(tx, id, v.snapshot, me.id);
    await logActivity(tx, id, me.id, `${me.nickname} 把行程恢复到了 ${v.createdAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} 的版本`);
  });
  emit(id, "plan", "media", "suggestions");
  return ok();
});
