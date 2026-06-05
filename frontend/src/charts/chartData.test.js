import { describe, it, expect } from "vitest";
import { tierColor, fiveMinChartData, hourlyChartData } from "./chartData.js";

// Fake CSS-var resolver mapping each tier token to a sentinel color.
const readVar = (name) =>
  ({
    "--neg": "#neg",
    "--cheap": "#cheap",
    "--moderate": "#moderate",
    "--high": "#high",
    "--spike": "#spike",
  })[name] || "";

describe("tierColor", () => {
  it("resolves the per-price tier token via the provided reader", () => {
    expect(tierColor(-1, readVar)).toBe("#neg");
    expect(tierColor(1, readVar)).toBe("#cheap");
    expect(tierColor(4, readVar)).toBe("#moderate");
    expect(tierColor(10, readVar)).toBe("#high");
    expect(tierColor(20, readVar)).toBe("#spike");
  });
});

describe("fiveMinChartData", () => {
  it("maps rows to {x,y} points and per-point tier colors", () => {
    const rows = [
      { millis_utc: 100, price_cents: 1 },
      { millis_utc: 200, price_cents: 9 },
    ];
    const out = fiveMinChartData(rows, readVar);
    expect(out.points).toEqual([
      { x: 100, y: 1 },
      { x: 200, y: 9 },
    ]);
    expect(out.colors).toEqual(["#cheap", "#high"]);
  });
});

describe("hourlyChartData", () => {
  it("maps hourly rows to data + per-bar tier colors", () => {
    const rows = [
      { hour_utc: "2026-06-04T00:00:00", avg_price_cents: 2 },
      { hour_utc: "2026-06-04T01:00:00", avg_price_cents: 16 },
    ];
    const out = hourlyChartData(rows, readVar);
    expect(out.data).toEqual([2, 16]);
    expect(out.colors).toEqual(["#cheap", "#spike"]);
  });
});
