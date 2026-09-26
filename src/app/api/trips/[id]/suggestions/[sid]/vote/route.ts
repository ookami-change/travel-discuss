import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { suggestions, suggestionVotes } from "@/db/schema";
import { requireMember } from "@/lib/auth";
import { emit } from "@/lib/events";
import { notFound, ok, route } from "@/lib/http";

type Ctx = RouteContext<"/api/trips/[id]/suggestions/[sid]/vote">;

async function check(ctx: Ctx) {
  const { id, sid } = await ctx.params;
  const me = await requireMember(id);
  const [s] = await db.select({ id: suggestions.id }).from(suggestions).where(and(eq(suggestions.id, sid), eq(suggestions.tripId, id)));
  if (!s) throw notFound("建议不存在");
  return { id, sid, me };
}

export const POST = route(async (_req, ctx: Ctx) => {
  const { id, sid, me } = await check(ctx);
  await db.insert(suggestionVotes).values({ suggestionId: sid, memberId: me.id }).onConflictDoNothing();
  emit(id, "suggestions");
  return ok();
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  const { id, sid, me } = await check(ctx);
  await db.delete(suggestionVotes).where(and(eq(suggestionVotes.suggestionId, sid), eq(suggestionVotes.memberId, me.id)));
  emit(id, "suggestions");
  return ok();
});
