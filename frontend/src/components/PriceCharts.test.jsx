import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render } from "@testing-library/react";

// Isolate Chart.js: mock the setup module so no canvas/WebGL is needed.
vi.mock("../charts/chartSetup.js", () => ({
  Chart: vi.fn(() => ({ destroy: vi.fn() })),
}));
import { Chart } from "../charts/chartSetup.js";
import PriceChart5min from "./PriceChart5min.jsx";
import PriceChartHourly from "./PriceChartHourly.jsx";

beforeAll(() => {
  // jsdom has no 2d context; return a stub so the effect proceeds.
  HTMLCanvasElement.prototype.getContext = () => ({});
});
beforeEach(() => Chart.mockClear());

describe("PriceChart5min", () => {
  it("builds a line chart with {x,y} points from the rows", () => {
    render(
      <PriceChart5min
        rows={[
          { millis_utc: 1, price_cents: 2 },
          { millis_utc: 2, price_cents: 9 },
        ]}
      />,
    );
    expect(Chart).toHaveBeenCalledTimes(1);
    const cfg = Chart.mock.calls[0][1];
    expect(cfg.type).toBe("line");
    expect(cfg.data.datasets[0].data).toEqual([
      { x: 1, y: 2 },
      { x: 2, y: 9 },
    ]);
    // zero-line annotation present (prices can go negative)
    expect(cfg.options.plugins.annotation.annotations.zero).toBeTruthy();
    // drag-zoom on x enabled
    expect(cfg.options.plugins.zoom.zoom.mode).toBe("x");
  });
});

describe("PriceChartHourly", () => {
  it("builds a bar chart with per-bar tier colors", () => {
    render(
      <PriceChartHourly
        rows={[{ hour_utc: "2026-06-04T00:00:00", avg_price_cents: 3 }]}
      />,
    );
    expect(Chart).toHaveBeenCalledTimes(1);
    const cfg = Chart.mock.calls[0][1];
    expect(cfg.type).toBe("bar");
    expect(cfg.data.datasets[0].data).toEqual([3]);
    expect(Array.isArray(cfg.data.datasets[0].backgroundColor)).toBe(true);
  });
});
