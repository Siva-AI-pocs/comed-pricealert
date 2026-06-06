import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SavingsSummary from "./SavingsSummary.jsx";

const summary = {
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
};

describe("SavingsSummary", () => {
  it("shows hourly-vs-flat and shift-to-cheap savings in dollars", () => {
    render(<SavingsSummary summary={summary} />);
    expect(screen.getByText("$1.00")).toBeInTheDocument(); // hourly vs flat
    expect(screen.getByText("$0.50")).toBeInTheDocument(); // shift savings
  });

  it("renders nothing without a summary", () => {
    const { container } = render(<SavingsSummary summary={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
