"use client";

import { createContext, useContext } from "react";
import type { TripInfo } from "@/lib/types";

const Ctx = createContext<TripInfo | null>(null);
export const TripProvider = Ctx.Provider;

export function useTrip() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTrip outside TripProvider");
  const nameOf = (id: string | null | undefined) => v.members.find((m) => m.id === id)?.nickname ?? "已离开的成员";
  const base = `/api/trips/${v.trip.id}`;
  return { ...v, nameOf, base, href: (p = "") => `/t/${v.trip.id}${p}` };
}
