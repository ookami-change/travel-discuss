import { eq } from "drizzle-orm";
import { db } from "@/db";
import { media } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireMember } from "@/lib/auth";
import { emit } from "@/lib/events";
import { badRequest, forbidden, ok, route } from "@/lib/http";
import { MAX_THUMB_BYTES, assertSize, findMedia } from "@/lib/media";
import { deleteObjects, objectSize } from "@/lib/storage";

/** Step 2: confirm the object actually landed (and is within limits), then publish it. */
export const POST = route(async (_req, ctx: RouteContext<"/api/trips/[id]/media/[mediaId]/complete">) => {
  const { id, mediaId } = await ctx.params;
  const me = await requireMember(id);
  const m = await findMedia(id, mediaId);
  if (m.uploaderId !== me.id) throw forbidden();
  if (m.status === "ready") return ok();
  const size = await objectSize(m.objectKey);
  if (size === null) throw badRequest("文件还没有上传成功");
  try {
    assertSize(m.kind, size);
  } catch (e) {
    await deleteObjects([m.objectKey, ...(m.thumbKey ? [m.thumbKey] : [])]);
    await db.delete(media).where(eq(media.id, m.id));
    throw e;
  }
  let thumbKey = m.thumbKey;
  if (thumbKey) {
    const t = await objectSize(thumbKey);
    if (t === null || t > MAX_THUMB_BYTES) {
      if (t !== null) await deleteObjects([thumbKey]);
      thumbKey = null;
    }
  }
  await db.update(media).set({ status: "ready", size, thumbKey }).where(eq(media.id, m.id));
  await logActivity(db, id, me.id, `${me.nickname} 上传了${m.kind === "photo" ? "照片" : "视频"}`);
  emit(id, "media");
  return ok();
});
