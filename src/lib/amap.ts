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

// ---- 冷门景点 (lib/explore) ----

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

function amapKey() {
  const key = process.env.AMAP_WEB_SERVICE_KEY;
  if (!key) throw new HttpError(503, "还没有配置高德 Key");
  return key;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The personal key's QPS cap is low, so space out request starts process-wide.
const MIN_GAP_MS = 350;
let nextSlot = 0;
async function throttle() {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + MIN_GAP_MS;
  if (at > now) await sleep(at - now);
}

/** GET a 高德 Web 服务 endpoint; backs off and retries when the per-second quota is hit. */
async function amapGet<T extends { status: string; info: string; infocode?: string }>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`https://restapi.amap.com${path}`);
  url.searchParams.set("key", amapKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let attempt = 0; ; attempt++) {
    await throttle();
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const data = (await res.json()) as T;
    if (data.status === "1") return data;
    if (data.info.includes("QPS") && attempt < 6) {
      await sleep(1000 * 2 ** Math.min(attempt, 3));
      continue;
    }
    throw new HttpError(502, `高德接口失败：${data.info}`);
  }
}

export type ScenicPoi = {
  poiId: string;
  name: string;
  typecode: string;
  type: string;
  district: string | null;
  address: string | null;
  lng: number;
  lat: number;
  rating: number | null;
};

const MAX_PAGES = 8;

/**
 * POIs in a region via 高德「搜索 POI 2.0」, in 高德's ranking. `region` is any adcode (city or county);
 * the query is a typecode list ("110101|110103") and/or keywords.
 */
export async function searchPois(region: string, query: { types?: string; keywords?: string }, max: number): Promise<ScenicPoi[]> {
  const out: ScenicPoi[] = [];
  for (let page = 1; out.length < max && page <= MAX_PAGES; page++) {
    const data = await amapGet<{
      status: string;
      info: string;
      pois?: { id: string; name: string; type: unknown; typecode: unknown; adname: unknown; address: unknown; location: unknown; business?: { rating?: unknown } }[];
    }>("/v5/place/text", {
      ...(query.types && { types: query.types }),
      ...(query.keywords && { keywords: query.keywords }),
      region,
      city_limit: "true",
      page_size: "25",
      page_num: String(page),
      show_fields: "business",
    });
    const pois = data.pois ?? [];
    for (const p of pois) {
      const loc = str(p.location)?.split(",").map(Number);
      if (!loc || !Number.isFinite(loc[0]) || !Number.isFinite(loc[1])) continue;
      const rating = Number(str(p.business?.rating));
      out.push({
        poiId: p.id,
        name: p.name,
        typecode: str(p.typecode) ?? "",
        type: str(p.type) ?? "",
        district: str(p.adname),
        address: str(p.address),
        lng: loc[0],
        lat: loc[1],
        rating: Number.isFinite(rating) && rating > 0 ? rating : null,
      });
    }
    if (pois.length < 25) break;
  }
  return out.slice(0, max);
}

/** Total count of 餐饮 + 住宿 POIs within `radius` metres — our proxy for tourist volume. */
export async function amenityCount(lng: number, lat: number, radius: number): Promise<number> {
  const data = await amapGet<{ status: string; info: string; count?: unknown }>("/v3/place/around", {
    location: `${lng.toFixed(6)},${lat.toFixed(6)}`,
    radius: String(radius),
    types: "050000|100000",
    offset: "1",
    page: "1",
  });
  const n = Number(data.count);
  return Number.isFinite(n) ? n : 0;
}

/** Ratings (0 = unrated) of the ~25 nearest 餐饮 POIs within `radius` metres, plus the total count there. */
export async function foodAround(lng: number, lat: number, radius: number): Promise<{ count: number; ratings: number[] }> {
  const data = await amapGet<{ status: string; info: string; count?: unknown; pois?: { biz_ext?: { rating?: unknown } }[] }>("/v3/place/around", {
    location: `${lng.toFixed(6)},${lat.toFixed(6)}`,
    radius: String(radius),
    types: "050000",
    offset: "25",
    page: "1",
    extensions: "all",
  });
  const count = Number(data.count);
  return {
    count: Number.isFinite(count) ? count : 0,
    ratings: (data.pois ?? []).map((p) => Number(str(p.biz_ext?.rating)) || 0),
  };
}
