import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activity } from "@/db/schema";
import { requireMember } from "@/lib/auth";
import { ok, route } from "@/lib/http";

export const GET = route(async (_req, ctx: RouteContext<"/api/trips/[id]/activity">) => {
  const { id } = await ctx.params;
  await requireMember(id);
  const rows = await db.select().from(activity).where(eq(activity.tripId, id)).orderBy(desc(activity.id)).limit(200);
  return ok(rows);
});
