import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { expenses, members } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireMember } from "@/lib/auth";
import { emit } from "@/lib/events";
import { body, notFound, ok, route } from "@/lib/http";
import { date } from "@/lib/validation";

type Ctx = RouteContext<"/api/trips/[id]/expenses">;

export const GET = route(async (_req, ctx: Ctx) => {
  const { id } = await ctx.params;
  await requireMember(id);
  return ok(await db.select().from(expenses).where(eq(expenses.tripId, id)).orderBy(desc(expenses.createdAt)));
});

export const POST = route(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const me = await requireMember(id);
  const input = await body(
    req,
    z.object({
      title: z.string().trim().min(1, "请填写项目").max(100),
      amountCents: z.number().int().positive("金额要大于 0").max(100_000_000),
      payerId: z.string().uuid(),
      spentOn: date.nullish(),
    }),
  );
  const [payer] = await db
    .select()
    .from(members)
    .where(and(eq(members.id, input.payerId), eq(members.tripId, id), isNull(members.removedAt)));
  if (!payer) throw notFound("付款人不存在");
  const [e] = await db.insert(expenses).values({ ...input, tripId: id, createdBy: me.id }).returning();
  await logActivity(db, id, me.id, `${me.nickname} 记了一笔：${e.title} ¥${(e.amountCents / 100).toFixed(2)}（${payer.nickname} 付）`);
  emit(id, "expenses");
  return ok(e);
});
