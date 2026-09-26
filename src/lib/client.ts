"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import useSWR, { useSWRConfig, type SWRConfiguration } from "swr";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Sub-path the app is served under ("" at the domain root). Next <Link> adds it itself; fetch doesn't. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const withBase = (url: string) => (url.startsWith("/") ? BASE_PATH + url : url);

/** Set by the service worker when a GET was answered from its offline cache. */
export const OFFLINE_HEADER = "x-offline-snapshot";

async function parse(res: Response) {
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `请求失败（${res.status}）`);
  return data;
}

export async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(withBase(url), {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "网络连接失败，请检查网络");
  }
  return parse(res);
}

const offlineAt = new Map<string, string>();
export const offlineSnapshotTime = (url: string) => offlineAt.get(url) ?? null;

const fetcher = async (url: string) => {
  const res = await fetch(withBase(url));
  const cached = res.headers.get(OFFLINE_HEADER);
  if (cached) offlineAt.set(url, cached);
  else offlineAt.delete(url);
  return parse(res);
};

export function useApi<T>(url: string | null, config?: SWRConfiguration<T>) {
  return useSWR<T>(url, fetcher, { revalidateOnFocus: true, ...config });
}

/** Subscribes to the trip's change feed and revalidates matching SWR keys. */
export function useLiveUpdates(tripId: string) {
  const { mutate } = useSWRConfig();
  useEffect(() => {
    const base = `/api/trips/${tripId}`;
    const es = new EventSource(withBase(`${base}/events`));
    es.onmessage = (e) => {
      const scopes: string[] = JSON.parse(e.data);
      mutate((key) => {
        if (typeof key !== "string" || !key.startsWith(base)) return false;
        const rest = key.slice(base.length);
        if (rest === "" || rest.startsWith("?")) return scopes.includes("trip") || scopes.includes("members");
        return scopes.some((s) => rest.startsWith(`/${s}`));
      });
    };
    // Catch up on anything missed while the connection was down.
    es.onopen = () => mutate((key) => typeof key === "string" && key.startsWith(base));
    return () => es.close();
  }, [tripId, mutate]);
}

// Trips this device has joined, for the home screen. Server cookies are the real auth.
const KNOWN = "td:trips";
export type KnownTrip = { id: string; name: string; inviteCode?: string };

export function knownTrips(): KnownTrip[] {
  try {
    return JSON.parse(localStorage.getItem(KNOWN) ?? "[]");
  } catch {
    return [];
  }
}

const subscribeStorage = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};
const readKnownRaw = () => {
  try {
    return localStorage.getItem(KNOWN) ?? "[]";
  } catch {
    return "[]";
  }
};

/** null until hydrated on the client. */
export function useKnownTrips(): KnownTrip[] | null {
  const raw = useSyncExternalStore(subscribeStorage, readKnownRaw, () => null);
  return useMemo(() => {
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as KnownTrip[];
    } catch {
      return [];
    }
  }, [raw]);
}

const noopSubscribe = () => () => {};
/** window.location.origin, or "" during server render. */
export function useOrigin() {
  return useSyncExternalStore(noopSubscribe, () => location.origin, () => "");
}

export function rememberTrip(t: KnownTrip) {
  try {
    const list = knownTrips().filter((x) => x.id !== t.id);
    localStorage.setItem(KNOWN, JSON.stringify([t, ...list].slice(0, 30)));
  } catch {}
}

export function forgetTrip(id: string) {
  try {
    localStorage.setItem(KNOWN, JSON.stringify(knownTrips().filter((x) => x.id !== id)));
  } catch {}
}
