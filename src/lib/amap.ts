import { HttpError } from "./http";

export type PlaceHit = { name: string; address: string | null; lng: number | null; lat: number | null; poiId: string | null; district: string | null };

/** 高德「输入提示」API. Coordinates come back as GCJ-02, which is what 高德/Apple Maps expect in China. */
export async function searchPlaces(keywords: string, city?: string | null): Promise<PlaceHit[]> {
  const key = process.env.AMAP_WEB_SERVICE_KEY;
  if (!key) throw new HttpError(503, "还没有配置高德 Key，可以先手动填写地址");
  const url = new URL("https://restapi.amap.com/v3/assistant/inputtips");
  url.searchParams.set("key", key);
  url.searchParams.set("keywords", keywords);
  if (city) url.searchParams.set("city", city);
  url.searchParams.set("datatype", "poi");
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const data = (await res.json()) as {
    status: string;
    info: string;
    tips?: { id: unknown; name: string; district: unknown; address: unknown; location: unknown }[];
  };
  if (data.status !== "1") throw new HttpError(502, `高德搜索失败：${data.info}`);
  // 高德 returns [] instead of "" for missing fields.
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  return (data.tips ?? []).map((t) => {
    const loc = str(t.location)?.split(",").map(Number);
    return {
      name: t.name,
      address: str(t.address),
      district: str(t.district),
      poiId: str(t.id),
      lng: loc?.[0] ?? null,
      lat: loc?.[1] ?? null,
    };
  });
}
