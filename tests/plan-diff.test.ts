import { describe, expect, it } from "vitest";
import type { PlanSnapshot } from "@/db/schema";
import { diffPlan, putItem, restoreDay, restoreItem } from "@/lib/plan-diff";

const item = (id: string | undefined, title: string, extra: Partial<PlanSnapshot["days"][number]["items"][number]> = {}) => ({
  id,
  title,
  type: "sight" as const,
  address: null,
  lng: null,
  lat: null,
  poiId: null,
  time: null,
  notes: null,
  transport: null,
  suggestionId: null,
  ...extra,
});

const current: PlanSnapshot = {
  days: [
    { id: "d1", title: "老城", lodging: { name: "客栈" }, items: [item("a", "A"), item("b", "B"), item("c", "C")] },
    { id: "d2", title: "湖边", lodging: null, items: [item("x", "X")] },
  ],
};

describe("diffPlan", () => {
  it("reports additions, edits, moves and removals in place", () => {
    const draft: PlanSnapshot = {
      days: [
        { id: "d1", title: "老城", lodging: { name: "新酒店" }, items: [item("a", "A", { time: "10:00" }), item("c", "C"), item(undefined, "N")] },
        { id: "d2", title: "湖边", lodging: null, items: [item("x", "X")] },
      ],
    };
    const diff = diffPlan(current, draft);
    expect(diff.counts).toEqual({ added: 1, removed: 1, changed: 1 });
    const rows = diff.days[0].rows.map((r) => `${r.kind}:${r.kind === "removed" ? r.before.title : r.item.title}`);
    expect(rows).toEqual(["changed:A", "removed:B", "same:C", "added:N"]);
    expect(diff.days[0].rows[0]).toMatchObject({ changes: [{ label: "时间", before: "", after: "10:00" }] });
    expect(diff.days[0].lodging.changed).toBe(true);
    expect(diff.days[1].rows.every((r) => r.kind === "same")).toBe(true);
  });

  it("marks moved items and dropped days", () => {
    const draft: PlanSnapshot = { days: [{ id: "d1", title: "老城", lodging: { name: "客栈" }, items: [item("a", "A"), item("b", "B"), item("c", "C"), item("x", "X")] }] };
    const diff = diffPlan(current, draft);
    expect(diff.days[0].rows[3]).toMatchObject({ kind: "changed", movedFrom: 1 });
    expect(diff.days).toHaveLength(2);
    expect(diff.days[1]).toMatchObject({ at: null, from: 1, rows: [] });
    expect(diff.counts).toEqual({ added: 0, removed: 0, changed: 1 });
  });
});

describe("draft edits", () => {
  it("restores a dropped item near its old slot and a dropped day without duplicates", () => {
    const draft: PlanSnapshot = { days: [{ id: "d1", title: "老城", lodging: null, items: [item("a", "A"), item("c", "C"), item("x", "X")] }] };
    const withB = restoreItem(draft, current, 0, 1);
    expect(withB.days[0].items.map((i) => i.id)).toEqual(["a", "b", "c", "x"]);
    const withDay = restoreDay(draft, current, 1);
    expect(withDay.days.map((d) => d.id)).toEqual(["d1", "d2"]);
    expect(withDay.days[1].items).toEqual([]);
    expect(diffPlan(current, restoreItem(withB, current, 0, 1)).counts.added).toBe(1); // duplicate id counts as new
  });

  it("moves an item to another day when edited", () => {
    const next = putItem(current, 0, 0, item("a", "A2"), 1);
    expect(next.days[0].items.map((i) => i.id)).toEqual(["b", "c"]);
    expect(next.days[1].items.map((i) => i.title)).toEqual(["X", "A2"]);
    expect(current.days[0].items).toHaveLength(3);
  });
});
