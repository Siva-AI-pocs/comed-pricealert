import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render } from "@testing-library/react";

vi.mock("../charts/chartSetup.js", () => ({
  Chart: vi.fn(() => ({ destroy: vi.fn() })),
}));
import { Chart } from "../charts/chartSetup.js";
import ForecastChart from "./ForecastChart.jsx";

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = () => ({});
});
beforeEach(() => Chart.mockClear());

const rows = [
  { target_ts: "2026-06-05T00:00:00", p10: 1, p50: 2, p90: 3, da_lmp: 2.5 },
  { target_ts: "2026-06-05T01:00:00", p10: 8, p50: 11, p90: 14, da_lmp: 6 },
];

describe("ForecastChart", () => {
  it("renders a band (P10–P90) + median line + day-ahead overlay", () => {
    render(<ForecastChart rows={rows} />);
    expect(Chart).toHaveBeenCalledTimes(1);
    const cfg = Chart.mock.calls[0][1];
    const labels = cfg.data.datasets.map((d) => d.label);
    expect(labels).toContain("P90"); // upper band
    expect(labels).toContain("Forecast"); // median
    expect(labels).toContain("Day-ahead");
    // the P90 dataset fills to the previous (P10) dataset
    const p90 = cfg.data.datasets.find((d) => d.label === "P90");
    expect(p90.fill).toBe("-1");
  });
});
