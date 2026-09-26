import { db } from "@/db";
import { suggestions, suggestionVotes } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireMember } from "@/lib/auth";
import { emit } from "@/lib/events";
import { body, ok, route } from "@/lib/http";
import { listSuggestions, suggestionInput } from "@/lib/suggestions";

type Ctx = RouteContext<"/api/trips/[id]/suggestions">;

export const GET = route(async (_req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const me = await requireMember(id);
  return ok(await listSuggestions(id, me.id));
});

export const POST = route(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const me = await requireMember(id);
  const input = await body(req, suggestionInput);
  const [s] = await db.insert(suggestions).values({ ...input, tripId: id, authorId: me.id }).returning();
  await db.insert(suggestionVotes).values({ suggestionId: s.id, memberId: me.id });
  await logActivity(db, id, me.id, `${me.nickname} 提议了「${s.title}」`);
  emit(id, "suggestions");
  return ok(s);
});
