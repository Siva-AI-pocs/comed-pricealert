import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test/utils.jsx";

vi.mock("../charts/chartSetup.js", () => ({ Chart: vi.fn(() => ({ destroy: vi.fn() })) }));
vi.mock("../api/usage.js", () => ({
  usageApi: { meters: vi.fn(), insights: vi.fn(), deleteMeter: vi.fn().mockResolvedValue({}), upload: vi.fn() },
}));
import { usageApi } from "../api/usage.js";
import UsageSavingsTab from "./UsageSavingsTab.jsx";

const SUMMARY = {
  actual_cost_cents: 1571, flat_cost_cents: 5011, flat_rate_cents: 8.5, hourly_vs_flat_cents: 3440,
  optimized_cost_cents: 1134, shift_savings_cents: 437, shiftable_kwh: 84, shiftable_pct: 0.3, total_kwh: 384, days: 30,
};
const HOURLY = [{ hour_utc: "2026-05-01T00:00:00", kwh: 1.2, price_cents: 6, cost_cents: 7.2, level: "cheap", price_estimated: false }];
const METER = { id: 1, espi_usage_point_id: "UP1", service_kind: "electricity", label: null,
  created_at: "2026-05-31T00:00:00", interval_count: 720, interval_start_utc: "2026-05-01T00:00:00", interval_end_utc: "2026-05-31T23:00:00" };

beforeEach(() => {
  vi.clearAllMocks();
  HTMLCanvasElement.prototype.getContext = () => ({});
});

describe("UsageSavingsTab", () => {
  it("shows the empty state when no meters are uploaded", async () => {
    usageApi.meters.mockResolvedValue([]);
    usageApi.insights.mockResolvedValue({ hourly: [], summary: { ...SUMMARY, total_kwh: 0 } });
    renderWithProviders(<UsageSavingsTab />, { authed: true });
    expect(await screen.findByText(/upload your comed usage to see it charted/i)).toBeInTheDocument();
  });

  it("renders the save-cards + shift calculator after data loads (default 30d)", async () => {
    usageApi.meters.mockResolvedValue([METER]);
    usageApi.insights.mockResolvedValue({ hourly: HOURLY, summary: SUMMARY });
    renderWithProviders(<UsageSavingsTab />, { authed: true });
    expect(await screen.findByText("Your usage · hourly pricing")).toBeInTheDocument();
    expect(screen.getByText("Hourly pricing saved you")).toBeInTheDocument();
    expect(screen.getAllByText("$15.71").length).toBeGreaterThanOrEqual(1); // appears in a save-card + the callout
    expect(screen.getByText("+$4.37")).toBeInTheDocument();                 // calculator headline
    expect(screen.getByText(/hourly pricing already saved you/i)).toBeInTheDocument(); // callout
    await waitFor(() => expect(usageApi.insights).toHaveBeenCalled());
    expect(usageApi.insights.mock.calls.at(-1)[0].days).toBe(30);           // default 30d
  });

  it("switching the range refetches with the new days", async () => {
    const user = userEvent.setup();
    usageApi.meters.mockResolvedValue([METER]);
    usageApi.insights.mockResolvedValue({ hourly: HOURLY, summary: SUMMARY });
    renderWithProviders(<UsageSavingsTab />, { authed: true });
    await screen.findByText("Your usage · hourly pricing");
    await user.click(screen.getByRole("button", { name: "7d" }));
    await waitFor(() => expect(usageApi.insights.mock.calls.at(-1)[0].days).toBe(7));
  });
});
