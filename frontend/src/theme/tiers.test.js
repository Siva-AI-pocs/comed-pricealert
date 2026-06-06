import { describe, it, expect } from "vitest";
import { PRICE_TIERS, priceTier, tierMeta, tierVar } from "./tiers";

// The 5-tier SEMANTIC price scale (DESIGN_SYSTEM.md) is non-negotiable and
// shared with the backend (/api/decision). Each tier owns its lower bound.
// This test locks the behaviour change away from the old 4-tier app.js scheme
// (which used green<=0 / blue<=3 / orange<=8 / red>8).
describe("priceTier — 5-tier boundaries", () => {
  it.each([
    [-5, "negative"],
    [-0.01, "negative"],
    [0, "cheap"], // 0 is Cheap, not Negative
    [1.7, "cheap"],
    [2.999, "cheap"],
    [3, "moderate"],
    [4, "moderate"], // was "orange"/high-ish in old app.js; now Moderate
    [7.999, "moderate"],
    [8, "high"],
    [14.999, "high"],
    [15, "spike"],
    [100, "spike"],
  ])("priceTier(%s) === %s", (price, tier) => {
    expect(priceTier(price)).toBe(tier);
  });
});

describe("PRICE_TIERS metadata", () => {
  it("defines exactly the 5 semantic tiers in order", () => {
    expect(PRICE_TIERS.map((t) => t.key)).toEqual([
      "negative",
      "cheap",
      "moderate",
      "high",
      "spike",
    ]);
  });

  it("maps the negative tier to the --neg token (not --negative)", () => {
    expect(tierMeta("negative").token).toBe("neg");
  });

  it("each tier carries a human label", () => {
    expect(tierMeta("spike").label).toBe("Spike");
    expect(tierMeta("moderate").label).toBe("Moderate");
  });
});

describe("tierVar — CSS custom property for a price", () => {
  it.each([
    [-1, "var(--neg)"],
    [1, "var(--cheap)"],
    [5, "var(--moderate)"],
    [10, "var(--high)"],
    [20, "var(--spike)"],
  ])("tierVar(%s) === %s", (price, expected) => {
    expect(tierVar(price)).toBe(expected);
  });
});
