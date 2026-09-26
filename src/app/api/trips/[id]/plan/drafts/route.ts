import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { aiDrafts } from "@/db/schema";
import { aiConfigured } from "@/lib/ai";
import { logActivity } from "@/lib/activity";
import { requireMember } from "@/lib/auth";
import { runDraft } from "@/lib/drafts";
import { emit } from "@/lib/events";
import { HttpError, body, ok, route } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { optText } from "@/lib/validation";

type Ctx = RouteContext<"/api/trips/[id]/plan/drafts">;

export const GET = route(async (_req, ctx: Ctx) => {
  const { id } = await ctx.params;
  await requireMember(id);
  const [latest] = await db.select().from(aiDrafts).where(eq(aiDrafts.tripId, id)).orderBy(desc(aiDrafts.createdAt)).limit(1);
  return ok({ enabled: aiConfigured(), latest: latest ?? null });
});

export const POST = route(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const me = await requireMember(id);
  if (!aiConfigured()) throw new HttpError(503, "还没有配置 AI（AI_API_KEY）");
  const { instructions } = await body(req, z.object({ instructions: optText(1000) }));
  const [running] = await db
    .select({ id: aiDrafts.id })
    .from(aiDrafts)
    .where(and(eq(aiDrafts.tripId, id), eq(aiDrafts.status, "pending"), gt(aiDrafts.createdAt, new Date(Date.now() - 5 * 60000))));
  if (running) throw new HttpError(409, "AI 正在生成方案，请稍等");
  rateLimit(`draft:${id}`, 10, 60 * 60 * 1000);
  const [draft] = await db.insert(aiDrafts).values({ tripId: id, createdBy: me.id, status: "pending", instructions }).returning();
  await logActivity(db, id, me.id, `${me.nickname} 让 AI 生成了一份候选方案`);
  emit(id, "plan");
  void runDraft(draft.id, id, instructions);
  return ok(draft);
});
