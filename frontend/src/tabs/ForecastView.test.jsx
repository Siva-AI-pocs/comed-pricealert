import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../charts/chartSetup.js", () => ({
  Chart: vi.fn(() => ({ destroy: vi.fn() })),
}));
import ForecastView from "./ForecastView.jsx";

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = () => ({});
});

function mkRes(json, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve(json),
    text: () => Promise.resolve(""),
  };
}

function forecastRows(n = 8) {
  return Array.from({ length: n }, (_, h) => {
    const p50 = h >= 5 ? 11 : 1;
    return {
      target_ts: `2026-06-05T${String(h).padStart(2, "0")}:00:00`,
      p10: p50 - 0.5,
      p50,
      p90: p50 + 0.5,
      spike_prob: p50 > 8 ? 0.4 : 0.02,
      da_lmp: null,
      model_version: "baseline-v1",
    };
  });
}

afterEach(() => vi.restoreAllMocks());

function route(forecast, accuracy) {
  global.fetch = vi.fn((url) => {
    const path = url.split("?")[0];
    if (path === "/api/forecast") return Promise.resolve(mkRes(forecast));
    if (path === "/api/forecast/accuracy") return Promise.resolve(mkRes(accuracy));
    return Promise.resolve(mkRes({}, { ok: false, status: 404 }));
  });
}

describe("ForecastView", () => {
  it("renders plan cards and accuracy when a forecast is live", async () => {
    route(forecastRows(), { mae: 0.8, vs_day_ahead_pct: 31, daily: [] });
    render(<ForecastView />);
    expect(await screen.findByText(/cheapest window/i)).toBeInTheDocument();
    expect(screen.getByText(/spike risk/i)).toBeInTheDocument();
    expect(screen.getByText(/31% closer/i)).toBeInTheDocument();
  });

  it("shows an empty state when no forecast exists yet", async () => {
    route([], { mae: null, vs_day_ahead_pct: null, daily: [] });
    render(<ForecastView />);
    expect(
      await screen.findByText(/forecast will appear|enough price history/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/cheapest window/i)).not.toBeInTheDocument();
  });
});
