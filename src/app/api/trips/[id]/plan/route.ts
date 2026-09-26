import { requireMember } from "@/lib/auth";
import { ok, route } from "@/lib/http";
import { loadPlan } from "@/lib/plan";

export const GET = route(async (_req, ctx: RouteContext<"/api/trips/[id]/plan">) => {
  const { id } = await ctx.params;
  await requireMember(id);
  return ok(await loadPlan(id));
});
