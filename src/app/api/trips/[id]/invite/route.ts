import { eq } from "drizzle-orm";
import { db } from "@/db";
import { trips } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireAdmin } from "@/lib/auth";
import { inviteCode } from "@/lib/crypto";
import { emit } from "@/lib/events";
import { ok, route } from "@/lib/http";

/** Invalidates the old invite link. Existing members stay signed in. */
export const POST = route(async (_req, ctx: RouteContext<"/api/trips/[id]/invite">) => {
  const { id } = await ctx.params;
  const me = await requireAdmin(id);
  const code = inviteCode();
  await db.update(trips).set({ inviteCode: code }).where(eq(trips.id, id));
  await logActivity(db, id, me.id, `${me.nickname} 重置了邀请链接`);
  emit(id, "trip");
  return ok({ inviteCode: code });
});
