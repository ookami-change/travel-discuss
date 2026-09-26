import { endSession } from "@/lib/auth";
import { ok, route } from "@/lib/http";

export const POST = route(async (_req, ctx: RouteContext<"/api/trips/[id]/logout">) => {
  const { id } = await ctx.params;
  await endSession(id);
  return ok();
});
