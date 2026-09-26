import type { Lodging, PlanSnapshot } from "@/db/schema";
import { TRANSPORT_LABEL, TYPE_LABEL, formatMinutes } from "./labels";

// Compares the live plan with a candidate (AI draft) and offers the small edits the review
// screen needs. Pure functions so both are easy to test.

type Day = PlanSnapshot["days"][number];
type Item = Day["items"][number];

export type FieldChange = { label: string; before: string; after: string };

export type Row =
  | { kind: "added"; item: Item; at: number }
  | { kind: "same" | "changed"; item: Item; before: Item; changes: FieldChange[]; movedFrom: number | null; at: number }
  | { kind: "removed"; before: Item; fromDay: number; fromIndex: number };

export type DayDiff = {
  /** Index in the draft, or null for a day the draft drops. */
  at: number | null;
  /** Index in the current plan, or null for a new day. */
  from: number | null;
  title: { before: string | null; after: string | null; changed: boolean };
  lodging: { before: Lodging | null; after: Lodging | null; changed: boolean };
  rows: Row[];
};

export type PlanDiff = { days: DayDiff[]; counts: { added: number; removed: number; changed: number } };

const text = (v: string | null | undefined) => v?.trim() || "";

function transportText(t: Item["transport"]) {
  if (!t) return "";
  return [TRANSPORT_LABEL[t.mode]?.label ?? t.mode, formatMinutes(t.minutes), t.note].filter(Boolean).join(" ");
}

function itemChanges(before: Item, after: Item): FieldChange[] {
  const fields: [string, string, string][] = [
    ["名称", text(before.title), text(after.title)],
    ["类型", TYPE_LABEL[before.type]?.label ?? before.type, TYPE_LABEL[after.type]?.label ?? after.type],
    ["时间", text(before.time), text(after.time)],
    ["地址", text(before.address), text(after.address)],
    ["交通", transportText(before.transport), transportText(after.transport)],
    ["备注", text(before.notes), text(after.notes)],
  ];
  return fields.filter(([, b, a]) => b !== a).map(([label, b, a]) => ({ label, before: b, after: a }));
}

const lodgingText = (l: Lodging | null) => [text(l?.name), text(l?.address)].join("|");

export function diffPlan(current: PlanSnapshot, draft: PlanSnapshot): PlanDiff {
  const where = new Map<string, { day: number; index: number; item: Item }>();
  current.days.forEach((d, di) => d.items.forEach((it, ii) => it.id && where.set(it.id, { day: di, index: ii, item: it })));
  const kept = new Set<string>();
  const counts = { added: 0, removed: 0, changed: 0 };

  const dayFrom = (d: Day) => {
    const byId = d.id ? current.days.findIndex((c) => c.id === d.id) : -1;
    return byId >= 0 ? byId : null;
  };

  const days: DayDiff[] = draft.days.map((d, di) => {
    const from = dayFrom(d);
    const old = from === null ? null : current.days[from];
    const rows: Row[] = d.items.map((it, ii) => {
      const prev = it.id && !kept.has(it.id) ? where.get(it.id) : undefined;
      if (!prev) {
        counts.added++;
        return { kind: "added", item: it, at: ii };
      }
      kept.add(it.id!);
      const changes = itemChanges(prev.item, it);
      const movedFrom = prev.day === from ? null : prev.day;
      const changed = changes.length > 0 || movedFrom !== null;
      if (changed) counts.changed++;
      return { kind: changed ? "changed" : "same", item: it, before: prev.item, changes, movedFrom, at: ii };
    });
    const title = { before: old?.title ?? null, after: d.title, changed: old ? text(old.title) !== text(d.title) : Boolean(text(d.title)) };
    const lodging = {
      before: old?.lodging ?? null,
      after: d.lodging,
      changed: old ? lodgingText(old.lodging) !== lodgingText(d.lodging) : Boolean(d.lodging),
    };
    return { at: di, from, title, lodging, rows };
  });

  // Items that vanish show up in the day they used to belong to.
  const droppedDays: DayDiff[] = [];
  current.days.forEach((d, di) => {
    const removed = d.items
      .map((it, ii) => ({ it, ii }))
      .filter(({ it }) => !it.id || !kept.has(it.id))
      .map(({ it, ii }) => ({ kind: "removed" as const, before: it, fromDay: di, fromIndex: ii }));
    counts.removed += removed.length;
    const target = days.find((x) => x.from === di);
    if (target) {
      // Slot each removed item in before the first surviving neighbour that used to follow it.
      const oldIndex = (row: Row) => {
        if (row.kind === "added" || row.kind === "removed") return -1;
        const w = where.get(row.before.id!);
        return w?.day === di ? w.index : -1;
      };
      for (const r of removed) {
        const pos = target.rows.findIndex((row) => oldIndex(row) > r.fromIndex);
        target.rows.splice(pos < 0 ? target.rows.length : pos, 0, r);
      }
    } else {
      droppedDays.push({
        at: null,
        from: di,
        title: { before: d.title, after: null, changed: true },
        lodging: { before: d.lodging, after: null, changed: Boolean(d.lodging) },
        rows: removed,
      });
    }
  });

  return { days: [...days, ...droppedDays], counts };
}

export const hasChanges = (diff: DayDiff) =>
  diff.at === null || diff.from === null || diff.title.changed || diff.lodging.changed || diff.rows.some((r) => r.kind !== "same");

// ---- Edits on the draft (all return a new snapshot) ----

const clone = (s: PlanSnapshot): PlanSnapshot => structuredClone(s);

export function removeItem(s: PlanSnapshot, day: number, index: number) {
  const next = clone(s);
  next.days[day].items.splice(index, 1);
  return next;
}

export function moveItem(s: PlanSnapshot, day: number, index: number, direction: -1 | 1) {
  const next = clone(s);
  const items = next.days[day].items;
  const j = index + direction;
  if (j < 0 || j >= items.length) return s;
  [items[index], items[j]] = [items[j], items[index]];
  return next;
}

/** Updates an item in place, or moves it to the end of another day. `index` null adds a new item. */
export function putItem(s: PlanSnapshot, day: number, index: number | null, item: Item, toDay = day) {
  const next = clone(s);
  if (index === null) {
    next.days[toDay].items.push(item);
  } else if (toDay === day) {
    next.days[day].items[index] = item;
  } else {
    next.days[day].items.splice(index, 1);
    next.days[toDay].items.push(item);
  }
  return next;
}

/**
 * Puts a removed item back: into the draft day that is the same day it came from (by id), or the
 * same position otherwise, near its old slot.
 */
export function restoreItem(s: PlanSnapshot, current: PlanSnapshot, fromDay: number, fromIndex: number) {
  const next = clone(s);
  const old = current.days[fromDay];
  const item = old.items[fromIndex];
  let target = next.days.findIndex((d) => d.id && d.id === old.id);
  if (target < 0) target = Math.min(fromDay, next.days.length - 1);
  const items = next.days[target].items;
  items.splice(Math.min(fromIndex, items.length), 0, structuredClone(item));
  return next;
}

export function restoreDay(s: PlanSnapshot, current: PlanSnapshot, from: number) {
  const next = clone(s);
  const old = structuredClone(current.days[from]);
  const kept = new Set(next.days.flatMap((d) => d.items.map((i) => i.id)).filter(Boolean));
  old.items = old.items.filter((i) => !i.id || !kept.has(i.id));
  next.days.splice(Math.min(from, next.days.length), 0, old);
  return next;
}

export function removeDay(s: PlanSnapshot, day: number) {
  const next = clone(s);
  next.days.splice(day, 1);
  return next;
}

export function setDay(s: PlanSnapshot, day: number, patch: Partial<Pick<Day, "title" | "lodging">>) {
  const next = clone(s);
  Object.assign(next.days[day], patch);
  return next;
}

/** The live plan (as the API returns it) in snapshot form, so it can be diffed. */
export function fromPlan(days: { id: string; title: string | null; lodging: Lodging | null; items: Item[] }[]): PlanSnapshot {
  return {
    days: days.map((d) => ({
      id: d.id,
      title: d.title,
      lodging: d.lodging,
      items: d.items.map((i) => ({
        id: i.id,
        title: i.title,
        type: i.type,
        address: i.address,
        lng: i.lng,
        lat: i.lat,
        poiId: i.poiId,
        time: i.time,
        notes: i.notes,
        transport: i.transport,
        suggestionId: i.suggestionId,
      })),
    })),
  };
}
