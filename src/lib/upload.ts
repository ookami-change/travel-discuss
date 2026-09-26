"use client";

import { api } from "./client";

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

export function fileMime(f: File) {
  if (f.type) return f.type;
  return EXT_MIME[f.name.split(".").pop()?.toLowerCase() ?? ""] ?? "";
}

const THUMB_MAX = 480;

function canvasToJpeg(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, srcW: number, srcH: number) {
  const scale = Math.min(1, THUMB_MAX / Math.max(srcW, srcH));
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  draw(ctx, w, h);
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
}

async function imageThumb(file: File) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    return await canvasToJpeg((ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h), bmp.width, bmp.height);
  } finally {
    bmp.close();
  }
}

function videoThumb(file: File) {
  return new Promise<Blob | null>((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    const done = (b: Blob | null) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(b);
    };
    const timer = setTimeout(() => done(null), 8000);
    v.muted = true;
    v.playsInline = true;
    v.preload = "metadata";
    v.onloadeddata = () => {
      v.currentTime = Math.min(1, (v.duration || 0) / 2);
    };
    v.onseeked = () => canvasToJpeg((ctx, w, h) => ctx.drawImage(v, 0, 0, w, h), v.videoWidth, v.videoHeight).then(done, () => done(null));
    v.onerror = () => done(null);
    v.src = url;
  });
}

/** Best-effort: HEIC in Chrome or HEVC video may not decode, in which case there's no thumbnail. */
export async function makeThumb(file: File, mime: string) {
  try {
    return mime.startsWith("image/") ? await imageThumb(file) : await videoThumb(file);
  } catch {
    return null;
  }
}

function put(url: string, body: Blob, type: string, onProgress?: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`上传失败（${xhr.status}）`)));
    xhr.onerror = () => reject(new Error("上传失败，请检查网络"));
    xhr.send(body);
  });
}

export type UploadTarget = { itemId: string | null; dayId: string | null };

export async function uploadMedia(base: string, file: File, target: UploadTarget, onProgress: (p: number) => void) {
  const mime = fileMime(file);
  if (!mime.startsWith("image/") && !mime.startsWith("video/")) throw new Error("只支持照片和视频");
  const thumb = await makeThumb(file, mime);
  const init = await api<{ id: string; uploadUrl: string; thumbUploadUrl: string | null }>("POST", `${base}/media`, {
    mime,
    size: file.size,
    ...target,
    thumb: thumb ? { size: thumb.size } : null,
  });
  await put(init.uploadUrl, file, mime, onProgress);
  if (thumb && init.thumbUploadUrl) await put(init.thumbUploadUrl, thumb, "image/jpeg").catch(() => {});
  await api("POST", `${base}/media/${init.id}/complete`);
}
