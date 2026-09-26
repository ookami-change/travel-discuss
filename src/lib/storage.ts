import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { HttpError } from "./http";

// Any S3-compatible store: 腾讯云 COS in production, MinIO locally.
const bucket = process.env.S3_BUCKET;

const g = globalThis as unknown as { s3?: S3Client };

export function storageConfigured() {
  return Boolean(bucket && process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);
}

/**
 * COS's console shows the bucket domain (https://<bucket>.cos.<region>.myqcloud.com); the SDK
 * wants the service endpoint and adds the bucket itself. Accept either.
 */
export function serviceEndpoint(endpoint: string, bucketName: string) {
  const url = new URL(endpoint);
  if (url.hostname.startsWith(`${bucketName}.`)) url.hostname = url.hostname.slice(bucketName.length + 1);
  return url.origin;
}

function client() {
  if (!storageConfigured()) throw new HttpError(503, "还没有配置文件存储（S3_* 环境变量）");
  g.s3 ??= new S3Client({
    endpoint: serviceEndpoint(process.env.S3_ENDPOINT!, bucket!),
    region: process.env.S3_REGION || "ap-guangzhou",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
  });
  return g.s3;
}

export const UPLOAD_URL_TTL = 60 * 60;
const VIEW_URL_TTL = 6 * 60 * 60;

export function uploadUrl(key: string, contentType: string) {
  return getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn: UPLOAD_URL_TTL, signableHeaders: new Set(["content-type"]) },
  );
}

/**
 * Signing time is rounded down to the hour so the same object keeps the same URL for a
 * while and browsers can reuse cached images across refetches.
 */
export function viewUrl(key: string, download?: string) {
  const signingDate = new Date(Math.floor(Date.now() / 3600000) * 3600000);
  return getSignedUrl(
    client(),
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: download ? `attachment; filename*=UTF-8''${encodeURIComponent(download)}` : undefined,
    }),
    { expiresIn: VIEW_URL_TTL, signingDate },
  );
}

/** Size of an uploaded object, or null if it isn't there (yet). */
export async function objectSize(key: string) {
  try {
    const res = await client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return res.ContentLength ?? 0;
  } catch {
    return null;
  }
}

/**
 * One request per key: COS requires Content-MD5 on multi-object delete, which current AWS SDKs
 * no longer send (they use CRC32). We only ever delete an original + thumbnail at once anyway.
 */
export async function deleteObjects(keys: string[]) {
  if (!keys.length || !storageConfigured()) return;
  await Promise.all(keys.map((Key) => client().send(new DeleteObjectCommand({ Bucket: bucket, Key }))));
}
