import { describe, expect, it } from "vitest";
import { addDays, dayCount, progress, todayIndex, tripPhase } from "@/lib/itinerary";
import { shift } from "@/lib/plan";

const day = (id: string, done: boolean[]) => ({
  id,
  items: done.map((d, i) => ({ id: `${id}-${i}`, completedAt: d ? new Date() : null })),
});

describe("dates", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("counts inclusive days", () => {
    expect(dayCount("2026-10-01", "2026-10-01")).toBe(1);
    expect(dayCount("2026-10-01", "2026-10-07")).toBe(7);
  });
  it("derives trip phase", () => {
    expect(tripPhase(null, null, "2026-10-01")).toBe("planning");
    expect(tripPhase("2026-10-01", "2026-10-03", "2026-09-30")).toBe("planning");
    expect(tripPhase("2026-10-01", "2026-10-03", "2026-10-03")).toBe("travelling");
    expect(tripPhase("2026-10-01", "2026-10-03", "2026-10-04")).toBe("after");
  });
  it("finds today's day index only within the trip", () => {
    expect(todayIndex("2026-10-01", 3, "2026-10-02")).toBe(1);
    expect(todayIndex("2026-10-01", 3, "2026-10-04")).toBeNull();
    expect(todayIndex("2026-10-01", 3, "2026-09-30")).toBeNull();
  });
});

describe("progress", () => {
  it("current is the first unchecked item, spanning days", () => {
    const p = progress([day("a", [true, true]), day("b", [false, false])]);
    expect(p.current?.item.id).toBe("b-0");
    expect(p.current?.dayIndex).toBe(1);
    expect(p.next?.item.id).toBe("b-1");
    expect(p.done).toBe(2);
  });
  it("skips empty days and reports finished", () => {
    const p = progress([day("a", [true]), day("b", []), day("c", [true])]);
    expect(p.current).toBeNull();
    expect(p.finished).toBe(true);
  });
  it("an out-of-order check-off doesn't skip the earlier stop", () => {
    const p = progress([day("a", [false, true, false])]);
    expect(p.current?.item.id).toBe("a-0");
    expect(p.done).toBe(1);
  });
  it("empty plan is not finished", () => {
    expect(progress([]).finished).toBe(false);
  });
});

describe("shift", () => {
  it("swaps with neighbour and refuses at the edges", () => {
    expect(shift(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(shift(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
    expect(shift(["a", "b"], "a", "up")).toBeNull();
    expect(shift(["a", "b"], "b", "down")).toBeNull();
  });
});
