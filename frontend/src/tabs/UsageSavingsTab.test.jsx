import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("../charts/chartSetup.js", () => ({
  Chart: vi.fn(() => ({ destroy: vi.fn() })),
}));
import UsageSavingsTab from "./UsageSavingsTab.jsx";

function mkRes(json) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve(json),
    text: () => Promise.resolve(""),
  };
}

const METERS = [
  {
    id: 1,
    espi_usage_point_id: "UP-1",
    service_kind: "electricity",
    label: null,
    created_at: "2026-06-01T00:00:00",
    interval_count: 96,
  },
];
const INSIGHTS = {
  hourly: [{ hour_utc: "2026-06-04T00:00:00", kwh: 0.5, price_cents: 2 }],
  summary: {
    days: 7,
    total_kwh: 50,
    actual_cost_cents: 400,
    flat_cost_cents: 500,
    flat_rate_cents: 8.5,
    hourly_vs_flat_cents: 100,
    shiftable_pct: 0.3,
    shiftable_kwh: 15,
    optimized_cost_cents: 350,
    shift_savings_cents: 50,
  },
};

function route() {
  global.fetch = vi.fn((url) => {
    const path = url.split("?")[0];
    if (path === "/api/usage/meters") return Promise.resolve(mkRes(METERS));
    if (path === "/api/usage/insights") return Promise.resolve(mkRes(INSIGHTS));
    return Promise.resolve(mkRes({}));
  });
}

afterEach(() => vi.restoreAllMocks());

describe("UsageSavingsTab", () => {
  it("loads meters and savings", async () => {
    route();
    render(<UsageSavingsTab />);
    expect(await screen.findByText("UP-1")).toBeInTheDocument();
    expect(await screen.findByText("$1.00")).toBeInTheDocument(); // hourly vs flat
  });

  it("refetches insights with the new fraction when the slider changes", async () => {
    route();
    render(<UsageSavingsTab />);
    await screen.findByText("UP-1");
    fireEvent.change(screen.getByLabelText(/shiftable usage percent/i), {
      target: { value: "50" },
    });
    await waitFor(() => {
      const called = global.fetch.mock.calls.some(
        ([u]) =>
          u.startsWith("/api/usage/insights") && u.includes("shiftable_pct=0.5"),
      );
      expect(called).toBe(true);
    });
  });
});
