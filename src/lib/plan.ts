import { and, asc, desc, eq, notInArray, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { planDays, planItems, planVersions, suggestions, type PlanSnapshot } from "@/db/schema";
import { notFound } from "./http";

export const AUTO_SNAPSHOT_MINUTES = 30;

export async function loadPlan(tripId: string, tx: Tx | typeof db = db) {
  const days = await tx.select().from(planDays).where(eq(planDays.tripId, tripId)).orderBy(asc(planDays.position));
  const items = await tx.select().from(planItems).where(eq(planItems.tripId, tripId)).orderBy(asc(planItems.position));
  return days.map((d) => ({ ...d, items: items.filter((i) => i.dayId === d.id) }));
}

export type Plan = Awaited<ReturnType<typeof loadPlan>>;

export function toSnapshot(plan: Plan): PlanSnapshot {
  return {
    days: plan.map((d) => ({
      id: d.id,
      title: d.title,
      lodging: d.lodging ?? null,
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
        transport: i.transport ?? null,
        suggestionId: i.suggestionId,
      })),
    })),
  };
}

export async function saveVersion(tx: Tx, tripId: string, memberId: string | null, reason: string) {
  const plan = await loadPlan(tripId, tx);
  const [v] = await tx
    .insert(planVersions)
    .values({ tripId, createdBy: memberId, reason, snapshot: toSnapshot(plan) })
    .returning({ id: planVersions.id });
  return v;
}

/**
 * Called before every plan edit: keeps a rolling safety net so any edit session can be
 * rolled back, without writing a version per keystroke.
 */
export async function autoSnapshot(tx: Tx, tripId: string, memberId: string) {
  const [last] = await tx
    .select({ createdAt: planVersions.createdAt })
    .from(planVersions)
    .where(eq(planVersions.tripId, tripId))
    .orderBy(desc(planVersions.createdAt))
    .limit(1);
  if (last && Date.now() - last.createdAt.getTime() < AUTO_SNAPSHOT_MINUTES * 60000) return;
  const [anyDay] = await tx.select({ id: planDays.id }).from(planDays).where(eq(planDays.tripId, tripId)).limit(1);
  if (!anyDay) return;
  await saveVersion(tx, tripId, memberId, "自动保存");
}

/**
 * Replaces the trip's plan with `snapshot`. Days/items whose ids survive are updated in
 * place so attached photos and check-offs are kept; everything else is recreated.
 */
export async function applySnapshot(tx: Tx, tripId: string, snapshot: PlanSnapshot, memberId: string) {
  const current = await loadPlan(tripId, tx);
  const dayIds = new Set(current.map((d) => d.id));
  const itemIds = new Set(current.flatMap((d) => d.items.map((i) => i.id)));
  const keepDays: string[] = [];
  const keepItems: string[] = [];
  const now = new Date();

  for (const [di, day] of snapshot.days.entries()) {
    let dayId: string;
    const dayValues = { title: day.title, lodging: day.lodging, position: di + 1, updatedAt: now };
    if (day.id && dayIds.has(day.id) && !keepDays.includes(day.id)) {
      dayId = day.id;
      await tx.update(planDays).set(dayValues).where(eq(planDays.id, dayId));
    } else {
      [{ id: dayId }] = await tx.insert(planDays).values({ tripId, ...dayValues }).returning({ id: planDays.id });
    }
    keepDays.push(dayId);

    for (const [ii, item] of day.items.entries()) {
      const { id, ...fields } = item;
      const values = { ...fields, dayId, position: ii + 1, updatedAt: now, updatedBy: memberId };
      if (id && itemIds.has(id) && !keepItems.includes(id)) {
        await tx.update(planItems).set(values).where(eq(planItems.id, id));
        keepItems.push(id);
      } else {
        const [row] = await tx.insert(planItems).values({ tripId, ...values }).returning({ id: planItems.id });
        keepItems.push(row.id);
      }
    }
  }

  const itemFilter = keepItems.length ? notInArray(planItems.id, keepItems) : undefined;
  await tx.delete(planItems).where(and(eq(planItems.tripId, tripId), itemFilter));
  const dayFilter = keepDays.length ? notInArray(planDays.id, keepDays) : undefined;
  await tx.delete(planDays).where(and(eq(planDays.tripId, tripId), dayFilter));
}

/** Rewrites positions of the given rows (already in the desired order) to 1..n. */
export async function renumber(tx: Tx, table: typeof planDays | typeof planItems, ids: string[]) {
  for (const [i, id] of ids.entries()) await tx.update(table).set({ position: i + 1 }).where(eq(table.id, id));
}

export async function itemsOfDay(tx: Tx, dayId: string) {
  return tx.select().from(planItems).where(eq(planItems.dayId, dayId)).orderBy(asc(planItems.position));
}


/** Runs a plan edit in a transaction, after taking a rolling auto-snapshot. */
export async function editPlan<T>(tripId: string, memberId: string, fn: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    // Serialise concurrent edits of one trip's plan so position math stays consistent.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${tripId}))`);
    await autoSnapshot(tx, tripId, memberId);
    return fn(tx);
  });
}

export async function findDay(tx: Tx, tripId: string, dayId: string) {
  const [d] = await tx.select().from(planDays).where(and(eq(planDays.id, dayId), eq(planDays.tripId, tripId)));
  if (!d) throw notFound("这一天不存在");
  return d;
}

export async function findItem(tx: Tx, tripId: string, itemId: string) {
  const [i] = await tx.select().from(planItems).where(and(eq(planItems.id, itemId), eq(planItems.tripId, tripId)));
  if (!i) throw notFound("行程项不存在（可能刚被别人删除）");
  return i;
}

/** Moves an element one slot up/down within an ordered list of ids. */
export function shift(ids: string[], id: string, direction: "up" | "down") {
  const i = ids.indexOf(id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export async function assertSuggestion(tx: Tx, tripId: string, suggestionId: string | null | undefined) {
  if (!suggestionId) return;
  const [s] = await tx
    .select({ id: suggestions.id })
    .from(suggestions)
    .where(and(eq(suggestions.id, suggestionId), eq(suggestions.tripId, tripId)));
  if (!s) throw notFound("关联的建议不存在");
}
