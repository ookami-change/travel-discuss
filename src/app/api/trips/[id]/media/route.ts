import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { media, members } from "@/db/schema";
import { requireMember } from "@/lib/auth";
import { badRequest, body, ok, route } from "@/lib/http";
import { MAX_THUMB_BYTES, assertSize, mediaKind, objectKeys, resolveAttachment } from "@/lib/media";
import { rateLimit } from "@/lib/ratelimit";
import { uploadUrl, viewUrl } from "@/lib/storage";
import { optText } from "@/lib/validation";

type Ctx = RouteContext<"/api/trips/[id]/media">;

export const GET = route(async (_req, ctx: Ctx) => {
  const { id } = await ctx.params;
  await requireMember(id);
  const rows = await db
    .select({ m: media, uploader: members.nickname })
    .from(media)
    .innerJoin(members, eq(media.uploaderId, members.id))
    .where(and(eq(media.tripId, id), eq(media.status, "ready")))
    .orderBy(desc(media.createdAt))
    .limit(2000);
  return ok(
    await Promise.all(
      rows.map(async ({ m, uploader }) => ({
        id: m.id,
        kind: m.kind,
        mime: m.mime,
        size: m.size,
        caption: m.caption,
        itemId: m.itemId,
        dayId: m.dayId,
        uploaderId: m.uploaderId,
        uploader,
        createdAt: m.createdAt,
        url: await viewUrl(m.objectKey),
        thumbUrl: m.thumbKey ? await viewUrl(m.thumbKey) : null,
        downloadUrl: await viewUrl(m.objectKey, `${m.id}.${m.objectKey.split(".").pop()}`),
      })),
    ),
  );
});

/** Step 1 of an upload: reserve a row and hand back presigned PUT URLs for direct-to-COS upload. */
export const POST = route(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const me = await requireMember(id);
  rateLimit(`upload:${me.id}`, 300, 60 * 60 * 1000);
  const input = await body(
    req,
    z.object({
      mime: z.string().max(100),
      size: z.number().int().positive(),
      itemId: z.string().uuid().nullish(),
      dayId: z.string().uuid().nullish(),
      caption: optText(500),
      thumb: z.object({ size: z.number().int().positive() }).nullish(),
    }),
  );
  const kind = mediaKind(input.mime);
  assertSize(kind, input.size);
  if (input.thumb && input.thumb.size > MAX_THUMB_BYTES) throw badRequest("缩略图太大");
  const target = await resolveAttachment(db, id, input.itemId, input.dayId);
  const mediaId = randomUUID();
  const keys = objectKeys(id, mediaId, input.mime);
  const [upload, thumbUpload] = await Promise.all([
    uploadUrl(keys.original, input.mime),
    input.thumb ? uploadUrl(keys.thumb, "image/jpeg") : null,
  ]);
  await db.insert(media).values({
    id: mediaId,
    tripId: id,
    uploaderId: me.id,
    ...target,
    kind,
    objectKey: keys.original,
    thumbKey: input.thumb ? keys.thumb : null,
    mime: input.mime,
    size: input.size,
    caption: input.caption,
    status: "uploading",
  });
  return ok({ id: mediaId, uploadUrl: upload, thumbUploadUrl: thumbUpload });
});
