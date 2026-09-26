import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { suggestions } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireMember, type Member } from "@/lib/auth";
import { emit } from "@/lib/events";
import { body, forbidden, notFound, ok, route } from "@/lib/http";
import { listSuggestions, suggestionInput } from "@/lib/suggestions";

type Ctx = RouteContext<"/api/trips/[id]/suggestions/[sid]">;

async function load(tripId: string, sid: string) {
  const [s] = await db.select().from(suggestions).where(and(eq(suggestions.id, sid), eq(suggestions.tripId, tripId)));
  if (!s) throw notFound("建议不存在");
  return s;
}

const assertOwner = (s: { authorId: string }, me: Member) => {
  if (s.authorId !== me.id && !me.isAdmin) throw forbidden("只能修改自己的建议");
};

export const GET = route(async (_req, ctx: Ctx) => {
  const { id, sid } = await ctx.params;
  const me = await requireMember(id);
  const s = (await listSuggestions(id, me.id)).find((x) => x.id === sid);
  if (!s) throw notFound("建议不存在");
  return ok(s);
});

export const PATCH = route(async (req, ctx: Ctx) => {
  const { id, sid } = await ctx.params;
  const me = await requireMember(id);
  assertOwner(await load(id, sid), me);
  const input = await body(req, suggestionInput);
  await db.update(suggestions).set(input).where(eq(suggestions.id, sid));
  emit(id, "suggestions");
  return ok();
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  const { id, sid } = await ctx.params;
  const me = await requireMember(id);
  const s = await load(id, sid);
  assertOwner(s, me);
  await db.delete(suggestions).where(eq(suggestions.id, sid));
  await logActivity(db, id, me.id, `${me.nickname} 删除了建议「${s.title}」`);
  emit(id, "suggestions", "comments");
  return ok();
});
