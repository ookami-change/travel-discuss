import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { planVersions } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireMember } from "@/lib/auth";
import { emit } from "@/lib/events";
import { body, ok, route } from "@/lib/http";
import { saveVersion } from "@/lib/plan";

type Ctx = RouteContext<"/api/trips/[id]/plan/versions">;

export const GET = route(async (_req, ctx: Ctx) => {
  const { id } = await ctx.params;
  await requireMember(id);
  const rows = await db.select().from(planVersions).where(eq(planVersions.tripId, id)).orderBy(desc(planVersions.createdAt)).limit(100);
  return ok(
    rows.map(({ snapshot, ...v }) => ({
      ...v,
      dayCount: snapshot.days.length,
      itemCount: snapshot.days.reduce((n, d) => n + d.items.length, 0),
      snapshot,
    })),
  );
});

/** Manual "save a version" checkpoint. */
export const POST = route(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const me = await requireMember(id);
  const { reason } = await body(req, z.object({ reason: z.string().trim().min(1).max(100).default("手动保存") }));
  const v = await db.transaction(async (tx) => {
    const v = await saveVersion(tx, id, me.id, reason);
    await logActivity(tx, id, me.id, `${me.nickname} 保存了版本「${reason}」`);
    return v;
  });
  emit(id, "plan");
  return ok(v);
});
