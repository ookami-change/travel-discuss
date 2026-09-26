import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { media, planItems, planVersions } from "@/db/schema";
import { aiDraftSchema, draftToSnapshot, type DraftInput } from "@/lib/ai";
import { applySnapshot, autoSnapshot, loadPlan, toSnapshot } from "@/lib/plan";
import { makeTrip } from "./helpers";

const titles = (plan: Awaited<ReturnType<typeof loadPlan>>) => plan.map((d) => d.items.map((i) => i.title));

describe("applySnapshot", () => {
  it("round-trips a snapshot and keeps ids, check-offs and attached media", async () => {
    const { trip, me } = await makeTrip();
    const before = await loadPlan(trip.id);
    const a1 = before[0].items[0];
    await db.update(planItems).set({ completedAt: new Date() }).where(eq(planItems.id, a1.id));
    const [m] = await db
      .insert(media)
      .values({ tripId: trip.id, uploaderId: me.id, itemId: a1.id, kind: "photo", objectKey: "k", mime: "image/jpeg", size: 1, status: "ready" })
      .returning();

    const snap = toSnapshot(before);
    // Move A1 to day 2, drop A2, add a new item.
    const [x1, , ] = [snap.days[0].items[0], snap.days[0].items[1]];
    snap.days[0].items = [];
    snap.days[1].items = [...snap.days[1].items, x1, { ...x1, id: undefined, title: "NEW" }];
    await db.transaction((tx) => applySnapshot(tx, trip.id, snap, me.id));

    const after = await loadPlan(trip.id);
    expect(titles(after)).toEqual([[], ["B1", "A1", "NEW"]]);
    expect(after.map((d) => d.id)).toEqual(before.map((d) => d.id));
    const moved = after[1].items.find((i) => i.title === "A1")!;
    expect(moved.id).toBe(a1.id);
    expect(moved.completedAt).not.toBeNull();
    const [m2] = await db.select().from(media).where(eq(media.id, m.id));
    expect(m2.itemId).toBe(a1.id);
  });

  it("removes days not in the snapshot and recreates from id-less snapshots", async () => {
    const { trip, me } = await makeTrip();
    await db.transaction((tx) =>
      applySnapshot(tx, trip.id, { days: [{ title: "only", lodging: null, items: [{ title: "Z", type: "food", address: null, lng: null, lat: null, poiId: null, time: null, notes: null, transport: null, suggestionId: null }] }] }, me.id),
    );
    const after = await loadPlan(trip.id);
    expect(after).toHaveLength(1);
    expect(after[0].title).toBe("only");
    expect(titles(after)).toEqual([["Z"]]);
  });

  it("does not let a duplicated id claim the same row twice", async () => {
    const { trip, me } = await makeTrip([["A"]]);
    const snap = toSnapshot(await loadPlan(trip.id));
    snap.days[0].items.push({ ...snap.days[0].items[0] });
    await db.transaction((tx) => applySnapshot(tx, trip.id, snap, me.id));
    const after = await loadPlan(trip.id);
    expect(titles(after)).toEqual([["A", "A"]]);
    expect(new Set(after[0].items.map((i) => i.id)).size).toBe(2);
  });
});

describe("autoSnapshot", () => {
  it("writes at most one version per window", async () => {
    const { trip, me } = await makeTrip();
    await db.transaction((tx) => autoSnapshot(tx, trip.id, me.id));
    await db.transaction((tx) => autoSnapshot(tx, trip.id, me.id));
    const rows = await db.select().from(planVersions).where(eq(planVersions.tripId, trip.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].snapshot.days).toHaveLength(2);
  });
});

describe("draftToSnapshot", () => {
  it("only trusts known ids and copies coordinates from suggestions", async () => {
    const { trip } = await makeTrip([["Keep"]]);
    const plan = await loadPlan(trip.id);
    const input: DraftInput = {
      trip: { name: "t", destination: null, startDate: null, endDate: null },
      dayTotal: null,
      memberCount: 2,
      suggestions: [{ id: "s1", title: "西湖", type: "sight", address: "杭州", lng: 120.1, lat: 30.2, reason: null, votes: 3, comments: [] }],
      plan,
      instructions: null,
    };
    const raw = aiDraftSchema.parse({
      summary: "ok",
      days: [
        {
          title: "第一天",
          lodging: { name: "酒店" },
          items: [
            { id: plan[0].items[0].id, title: "Keep", type: "sight" },
            { id: "made-up", suggestionId: "s1", title: "西湖", type: "weird-type", time: "25:99", transport: { mode: "rocket", minutes: 10 } },
          ],
        },
      ],
    });
    const snap = draftToSnapshot(raw, input);
    const [keep, lake] = snap.days[0].items;
    expect(keep.id).toBe(plan[0].items[0].id);
    expect(snap.days[0].id).toBe(plan[0].id);
    expect(lake.id).toBeUndefined();
    expect(lake).toMatchObject({ suggestionId: "s1", lng: 120.1, lat: 30.2, type: "other", time: null, transport: { mode: "other", minutes: 10 } });
    expect(snap.days[0].lodging).toEqual({ name: "酒店", address: null });
  });
});
