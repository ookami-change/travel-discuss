import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { comments, suggestions } from "@/db/schema";
import { requireMember } from "@/lib/auth";
import { emit } from "@/lib/events";
import { body, notFound, ok, route } from "@/lib/http";

type Ctx = RouteContext<"/api/trips/[id]/comments">;

/** ?suggestionId=… for a card's thread; omitted for the trip-wide discussion. */
export const GET = route(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  await requireMember(id);
  const sid = new URL(req.url).searchParams.get("suggestionId");
  const rows = await db
    .select()
    .from(comments)
    .where(and(eq(comments.tripId, id), sid ? eq(comments.suggestionId, sid) : isNull(comments.suggestionId)))
    .orderBy(asc(comments.createdAt))
    .limit(500);
  return ok(rows);
});

export const POST = route(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const me = await requireMember(id);
  const input = await body(
    req,
    z.object({ body: z.string().trim().min(1, "说点什么吧").max(2000), suggestionId: z.string().uuid().nullish() }),
  );
  if (input.suggestionId) {
    const [s] = await db
      .select({ id: suggestions.id })
      .from(suggestions)
      .where(and(eq(suggestions.id, input.suggestionId), eq(suggestions.tripId, id)));
    if (!s) throw notFound("建议不存在");
  }
  const [c] = await db
    .insert(comments)
    .values({ tripId: id, authorId: me.id, body: input.body, suggestionId: input.suggestionId ?? null })
    .returning();
  emit(id, "comments", "suggestions");
  return ok(c);
});
