import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../charts/chartSetup.js", () => ({
  Chart: vi.fn(() => ({ destroy: vi.fn() })),
}));
import NowTab from "./NowTab.jsx";

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

function routeFetch(map) {
  global.fetch = vi.fn((url) => {
    // match by pathname prefix (ignore query string)
    const path = url.split("?")[0];
    const handler = map[path];
    return Promise.resolve(handler ? handler(url) : mkRes({}, { ok: false, status: 404 }));
  });
}

afterEach(() => vi.restoreAllMocks());

const STATS = {
  current_price: 1.7,
  hourly_avg: 2.1,
  day_min: 0.9,
  day_max: 8.4,
  week_avg: 4.3,
};
const DECISION = {
  current_price: 1.7,
  level: "cheap",
  emoji: "🟢",
  label: "Cheap",
  recommendation: "Cheap — good time to run appliances.",
  color_class: "cheap",
};

describe("NowTab", () => {
  it("loads and shows hero, decision, stats and daily summary", async () => {
    routeFetch({
      "/api/prices/stats": () => mkRes(STATS),
      "/api/decision": () => mkRes(DECISION),
      "/api/prices/daily-summary": () =>
        mkRes([{ date: "2026-06-04", min_price: 0.9, max_price: 8.4, avg_price: 3.2 }]),
      "/api/prices/5min": () => mkRes([{ millis_utc: 1, price_cents: 1.7 }]),
      "/api/prices/hourly": () =>
        mkRes([{ hour_utc: "2026-06-04T00:00:00", avg_price_cents: 2.1 }]),
    });
    render(<NowTab />);
    expect(await screen.findByText(/good time to run appliances/i)).toBeInTheDocument();
    expect(screen.getByTestId("price-hero")).toHaveAttribute("data-tier", "cheap");
    expect(screen.getByText("4.3¢")).toBeInTheDocument(); // 7-day avg stat
    expect(screen.getByText("2026-06-04")).toBeInTheDocument(); // daily row
  });

  it("refetches price history when the range preset changes", async () => {
    routeFetch({
      "/api/prices/stats": () => mkRes(STATS),
      "/api/decision": () => mkRes(DECISION),
      "/api/prices/daily-summary": () => mkRes([]),
      "/api/prices/5min": () => mkRes([]),
      "/api/prices/hourly": () => mkRes([]),
    });
    const user = userEvent.setup();
    render(<NowTab />);
    await screen.findByText(/good time to run appliances/i);
    await user.click(screen.getByRole("button", { name: "Today" }));
    await waitFor(() => {
      const calledToday = global.fetch.mock.calls.some(
        ([u]) => u.startsWith("/api/prices/5min") && u.includes("today=true"),
      );
      expect(calledToday).toBe(true);
    });
  });
});
