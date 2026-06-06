import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render } from "@testing-library/react";

vi.mock("../charts/chartSetup.js", () => ({
  Chart: vi.fn(() => ({ destroy: vi.fn() })),
}));
import { Chart } from "../charts/chartSetup.js";
import UsageVsPriceChart from "./UsageVsPriceChart.jsx";

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = () => ({});
});
beforeEach(() => Chart.mockClear());

describe("UsageVsPriceChart", () => {
  it("builds a dual-axis chart: usage bars + price line", () => {
    render(
      <UsageVsPriceChart
        hourly={[{ hour_utc: "2026-06-04T00:00:00", kwh: 0.5, price_cents: 3 }]}
      />,
    );
    expect(Chart).toHaveBeenCalledTimes(1);
    const cfg = Chart.mock.calls[0][1];
    const kinds = cfg.data.datasets.map((d) => d.type);
    expect(kinds).toContain("bar");
    expect(kinds).toContain("line");
    // a second y-axis exists for price
    expect(cfg.options.scales.y1).toBeTruthy();
  });
});
