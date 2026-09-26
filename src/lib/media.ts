import { and, eq } from "drizzle-orm";
import { type Tx, db } from "@/db";
import { media, planDays, planItems } from "@/db/schema";
import { badRequest, notFound } from "./http";

export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
export const MAX_THUMB_BYTES = 2 * 1024 * 1024;

export function mediaKind(mime: string) {
  if (mime.startsWith("image/")) return "photo" as const;
  if (mime.startsWith("video/")) return "video" as const;
  throw badRequest("只支持照片和视频");
}

export function assertSize(kind: "photo" | "video", size: number) {
  const max = kind === "photo" ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES;
  if (size > max) throw badRequest(`${kind === "photo" ? "照片" : "视频"}不能超过 ${max / 1024 / 1024}MB`);
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export const objectKeys = (tripId: string, mediaId: string, mime: string) => ({
  original: `trips/${tripId}/${mediaId}/original.${EXT[mime] ?? "bin"}`,
  thumb: `trips/${tripId}/${mediaId}/thumb.jpg`,
});

/** Validates an attachment target. An item implies its day. */
export async function resolveAttachment(tx: Tx | typeof db, tripId: string, itemId?: string | null, dayId?: string | null) {
  if (itemId) {
    const [i] = await tx.select().from(planItems).where(and(eq(planItems.id, itemId), eq(planItems.tripId, tripId)));
    if (!i) throw notFound("行程项不存在");
    return { itemId: i.id, dayId: i.dayId };
  }
  if (dayId) {
    const [d] = await tx.select().from(planDays).where(and(eq(planDays.id, dayId), eq(planDays.tripId, tripId)));
    if (!d) throw notFound("这一天不存在");
    return { itemId: null, dayId: d.id };
  }
  return { itemId: null, dayId: null };
}

export async function findMedia(tripId: string, mediaId: string) {
  const [m] = await db.select().from(media).where(and(eq(media.id, mediaId), eq(media.tripId, tripId)));
  if (!m) throw notFound("文件不存在");
  return m;
}
