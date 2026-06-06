import { describe, it, expect } from "vitest";
import { usageWindows } from "./nowWindows.js";

const mk = (prices) =>
  prices.map((p, i) => ({
    hour_utc: `2026-06-05T${String(i).padStart(2, "0")}:00:00Z`,
    avg_price_cents: p,
  }));

describe("usageWindows", () => {
  it("finds the cheapest and peak contiguous windows", () => {
    const rows = mk([10, 9, 1, 1, 1, 8]);
    const w = usageWindows(rows, 3);
    expect(w.cheapest.start).toBe(2);
    expect(w.cheapest.avg).toBeCloseTo(1);
    expect(w.peak.start).toBe(0);
    expect(w.peak.avg).toBeCloseTo(20 / 3);
  });

  it("carries the first/last row of each window for labeling", () => {
    const rows = mk([10, 9, 1, 1, 1, 8]);
    const w = usageWindows(rows, 3);
    expect(w.cheapest.startTs).toBe(rows[2].hour_utc);
    expect(w.cheapest.endTs).toBe(rows[4].hour_utc);
  });

  it("returns null when there aren't enough rows for a window", () => {
    expect(usageWindows([], 3)).toBeNull();
    expect(usageWindows(mk([1, 2]), 3)).toBeNull();
  });
});
