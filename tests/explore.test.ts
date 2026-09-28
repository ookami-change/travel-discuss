import { describe, expect, it } from "vitest";
import { isHiddenGem, quietScore } from "@/lib/explore";

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
