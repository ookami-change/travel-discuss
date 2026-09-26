// Pure helpers shared by server and client. Keep free of server-only imports.

export type ItineraryItem = { id: string; completedAt: string | Date | null };
export type ItineraryDay<I extends ItineraryItem = ItineraryItem> = { id: string; items: I[] };

/** Add `days` to a YYYY-MM-DD date string. */
export function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Inclusive number of days between two YYYY-MM-DD dates. */
export function dayCount(start: string, end: string) {
  const a = Date.UTC(...(start.split("-").map(Number) as [number, number, number]));
  const b = Date.UTC(...(end.split("-").map(Number) as [number, number, number]));
  return Math.round((b - a) / 86400000) + 1;
}

export function localToday(now = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function dayDate(startDate: string | null, index: number) {
  return startDate ? addDays(startDate, index) : null;
}

/**
 * Where the group is in the itinerary. The "current" stop is the first item not yet
 * checked off (the place you're at or heading to); "next" is the one after it.
 */
export function progress<I extends ItineraryItem, D extends ItineraryDay<I>>(days: D[]) {
  const flat = days.flatMap((day, dayIndex) => day.items.map((item) => ({ item, day, dayIndex })));
  const i = flat.findIndex((f) => !f.item.completedAt);
  return {
    total: flat.length,
    done: i === -1 ? flat.length : flat.filter((f) => f.item.completedAt).length,
    current: i === -1 ? null : flat[i],
    next: i === -1 ? null : (flat[i + 1] ?? null),
    finished: flat.length > 0 && i === -1,
  };
}

export type TripPhase = "planning" | "travelling" | "after";

export function tripPhase(startDate: string | null, endDate: string | null, today = localToday()): TripPhase {
  if (!startDate || today < startDate) return "planning";
  if (endDate && today > endDate) return "after";
  return "travelling";
}

/** Day index for `today` if it falls within the trip. */
export function todayIndex(startDate: string | null, dayTotal: number, today = localToday()) {
  if (!startDate) return null;
  const i = dayCount(startDate, today) - 1;
  return i >= 0 && i < dayTotal ? i : null;
}
