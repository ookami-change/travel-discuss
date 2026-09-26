import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { media } from "@/db/schema";
import { requireMember, type Member } from "@/lib/auth";
import { emit } from "@/lib/events";
import { body, forbidden, ok, route } from "@/lib/http";
import { findMedia, resolveAttachment } from "@/lib/media";
import { deleteObjects } from "@/lib/storage";
import { optText } from "@/lib/validation";

type Ctx = RouteContext<"/api/trips/[id]/media/[mediaId]">;

const assertOwner = (m: { uploaderId: string }, me: Member) => {
  if (m.uploaderId !== me.id && !me.isAdmin) throw forbidden("只能修改自己上传的内容");
};

export const PATCH = route(async (req, ctx: Ctx) => {
  const { id, mediaId } = await ctx.params;
  const me = await requireMember(id);
  const m = await findMedia(id, mediaId);
  assertOwner(m, me);
  const input = await body(
    req,
    z.object({ caption: optText(500).optional(), itemId: z.string().uuid().nullish(), dayId: z.string().uuid().nullish() }),
  );
  const patch: Partial<typeof media.$inferInsert> = {};
  if (input.caption !== undefined) patch.caption = input.caption;
  if (input.itemId !== undefined || input.dayId !== undefined) Object.assign(patch, await resolveAttachment(db, id, input.itemId, input.dayId));
  await db.update(media).set(patch).where(eq(media.id, m.id));
  emit(id, "media");
  return ok();
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  const { id, mediaId } = await ctx.params;
  const me = await requireMember(id);
  const m = await findMedia(id, mediaId);
  assertOwner(m, me);
  await db.delete(media).where(eq(media.id, m.id));
  await deleteObjects([m.objectKey, ...(m.thumbKey ? [m.thumbKey] : [])]);
  emit(id, "media");
  return ok();
});
