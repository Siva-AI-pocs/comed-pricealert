import { describe, it, expect } from "vitest";
import { bestWindow, deriveInsights } from "./forecastData.js";

// Build 24 hourly rows starting at midnight: cheap overnight, spike at 17–18h.
function rows() {
  const out = [];
  for (let h = 0; h < 24; h++) {
    const p50 = h >= 16 && h <= 18 ? 12 : h <= 5 ? 1 : 3;
    out.push({
      target_ts: `2026-06-05T${String(h).padStart(2, "0")}:00:00`,
      p10: p50 - 0.5,
      p50,
      p90: p50 + 0.5,
      spike_prob: p50 > 8 ? 0.4 : 0.02,
      da_lmp: null,
    });
  }
  return out;
}

describe("bestWindow", () => {
  it("finds the lowest-average contiguous window", () => {
    const w = bestWindow(rows(), 3);
    expect(w.len).toBe(3);
    // cheapest 3h block sits in the 0–5h overnight stretch
    expect(w.start).toBeLessThanOrEqual(3);
    expect(w.avg).toBeCloseTo(1, 5);
  });
});

describe("deriveInsights", () => {
  it("surfaces cheapest window, an EV block, and the spike risk", () => {
    const ins = deriveInsights(rows());
    expect(ins.cheapest.avg).toBeCloseTo(1, 5);
    expect(ins.ev.lengthHours).toBe(6);
    // spike picked from the pricey afternoon hours
    expect(ins.spike.pct).toBeGreaterThan(0);
    expect(ins.spike.hour).toBeGreaterThanOrEqual(15);
    expect(ins.spike.hour).toBeLessThanOrEqual(19);
  });

  it("is safe on an empty array", () => {
    expect(deriveInsights([])).toBeNull();
  });
});
