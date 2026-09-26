import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { comments } from "@/db/schema";
import { requireMember } from "@/lib/auth";
import { emit } from "@/lib/events";
import { forbidden, notFound, ok, route } from "@/lib/http";

export const DELETE = route(async (_req, ctx: RouteContext<"/api/trips/[id]/comments/[cid]">) => {
  const { id, cid } = await ctx.params;
  const me = await requireMember(id);
  const [c] = await db.select().from(comments).where(and(eq(comments.id, cid), eq(comments.tripId, id)));
  if (!c) throw notFound("评论不存在");
  if (c.authorId !== me.id && !me.isAdmin) throw forbidden("只能删除自己的评论");
  await db.delete(comments).where(eq(comments.id, cid));
  emit(id, "comments", "suggestions");
  return ok();
});
