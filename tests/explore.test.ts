import { describe, expect, it } from "vitest";
import { isAttraction, isHiddenGem, nearestWithin, quietScore, stayScore } from "@/lib/explore";

describe("quietScore", () => {
  it("is 100 with no amenities and falls on a log scale", () => {
    expect(quietScore(0, "110200")).toBe(100);
    expect(quietScore(10, "110200")).toBe(68);
    expect(quietScore(50, "110200")).toBe(31);
    expect(quietScore(500, "110200")).toBe(0);
  });

  it("docks famous sights", () => {
    expect(quietScore(0, "110201")).toBe(25);
    expect(quietScore(0, "110202")).toBe(70);
    expect(quietScore(0, "110203")).toBe(85);
    expect(quietScore(0, "110210|110201")).toBe(25);
    expect(quietScore(200, "110201")).toBe(0);
  });
});

it("hidden gem needs both quiet and a good rating", () => {
  expect(isHiddenGem({ quiet: 70, rating: 4.6 })).toBe(true);
  expect(isHiddenGem({ quiet: 70, rating: null })).toBe(false);
  expect(isHiddenGem({ quiet: 50, rating: 4.9 })).toBe(false);
});

describe("stayScore", () => {
  const food = (avg: number | null, good: number) => ({ count: 100, avg, good });

  it("weights hotel 30, food 35, distance 35", () => {
    expect(stayScore({ rating: 5, food: food(4.2, 5) }, 8)).toBe(100);
    expect(stayScore({ rating: 4, food: food(3, 0) }, 0)).toBe(0);
    expect(stayScore({ rating: 4.5, food: food(3.6, 2) }, 4)).toBe(48); // 15 + 35 × (0.5 × 0.5 + 0.5 × 0.4) + 35 × 0.5 = 48.25
  });

  it("scores unrated food as zero and unknown distance as half", () => {
    expect(stayScore({ rating: 5, food: food(null, 0) }, null)).toBe(30 + 18);
  });
});

it("nearestWithin finds the closest target inside maxKm only", () => {
  const targets = [
    { name: "A", lng: 108.0, lat: 24.0 },
    { name: "B", lng: 108.05, lat: 24.0 },
    { name: "C", lng: 110.0, lat: 26.0 },
  ];
  const [near, none] = nearestWithin([{ lng: 108.04, lat: 24.0 }, { lng: 112, lat: 20 }], targets);
  expect(near?.target.name).toBe("B");
  expect(near?.km).toBeCloseTo(1.02, 1);
  expect(none).toBeNull();
});

it("isAttraction skips parks, shop branches, low-rated spots and village temples", () => {
  const a = (typecode: string, rating: number | null, name = "某景区") => isAttraction({ typecode, rating, name });
  expect(a("110200", 4.2)).toBe(true);
  expect(a("110210|110202", 4.0)).toBe(true);
  expect(a("110200", 3.8)).toBe(false);
  expect(a("110200", null)).toBe(false);
  expect(a("110101", 4.8)).toBe(false);
  expect(a("110205", 4.2, "北帝庙")).toBe(false);
  expect(a("110205", 4.6, "南华寺")).toBe(true);
  expect(a("110200", 4.3, "茶瀑布(糖厂街店)")).toBe(false);
});
