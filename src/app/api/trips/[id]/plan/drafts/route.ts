import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { aiDrafts, planItems } from "@/db/schema";
import { aiConfigured } from "@/lib/ai";
import { logActivity } from "@/lib/activity";
import { requireMember } from "@/lib/auth";
import { runDraft } from "@/lib/drafts";
import { emit } from "@/lib/events";
import { HttpError, body, ok, route } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { optText } from "@/lib/validation";

type Ctx = RouteContext<"/api/trips/[id]/plan/drafts">;

const STALE_MS = 5 * 60 * 1000;

export const GET = route(async (_req, ctx: Ctx) => {
  const { id } = await ctx.params;
  await requireMember(id);
  const [latest] = await db.select().from(aiDrafts).where(eq(aiDrafts.tripId, id)).orderBy(desc(aiDrafts.createdAt)).limit(1);
  // A pending draft this old means the server restarted mid-generation.
  const stale = latest?.status === "pending" && Date.now() - latest.createdAt.getTime() > STALE_MS;
  return ok({ enabled: aiConfigured(), latest: stale ? { ...latest, status: "failed", error: "生成超时，请重试" } : (latest ?? null) });
});

export const POST = route(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const me = await requireMember(id);
  if (!aiConfigured()) throw new HttpError(503, "还没有配置 AI（AI_API_KEY）");
  const { mode, instructions } = await body(req, z.object({ mode: z.enum(["fresh", "adjust"]).default("fresh"), instructions: optText(1000) }));
  if (mode === "adjust") {
    if (!instructions) throw new HttpError(400, "请写下想怎么调整");
    const [anyItem] = await db.select({ id: planItems.id }).from(planItems).where(eq(planItems.tripId, id)).limit(1);
    if (!anyItem) throw new HttpError(400, "现在还没有行程，先让 AI 排一版吧");
  }
  const [running] = await db
    .select({ id: aiDrafts.id })
    .from(aiDrafts)
    .where(and(eq(aiDrafts.tripId, id), eq(aiDrafts.status, "pending"), gt(aiDrafts.createdAt, new Date(Date.now() - STALE_MS))));
  if (running) throw new HttpError(409, "AI 正在生成方案，请稍等");
  rateLimit(`draft:${id}`, 10, 60 * 60 * 1000);
  const [draft] = await db.insert(aiDrafts).values({ tripId: id, createdBy: me.id, status: "pending", mode, instructions }).returning();
  await logActivity(db, id, me.id, mode === "adjust" ? `${me.nickname} 让 AI 调整行程：${instructions}` : `${me.nickname} 让 AI 生成了一份候选方案`);
  emit(id, "plan");
  void runDraft(draft.id, id, mode, instructions);
  return ok(draft);
});
