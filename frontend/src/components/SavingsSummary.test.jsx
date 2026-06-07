import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SavingsSummary from "./SavingsSummary.jsx";

const summary = {
  actual_cost_cents: 1571,
  flat_cost_cents: 5011,
  hourly_vs_flat_cents: 3440,
  flat_rate_cents: 8.5,
};

describe("SavingsSummary save-cards", () => {
  it("renders usage·hourly, same·flat (with the rate), and saved", () => {
    render(<SavingsSummary summary={summary} />);
    expect(screen.getByText("$15.71")).toBeInTheDocument();
    expect(screen.getByText("$50.11")).toBeInTheDocument();
    expect(screen.getByText("$34.40")).toBeInTheDocument();
    expect(screen.getByText(/flat 8\.5¢/)).toBeInTheDocument();
  });

  it("renders nothing without a summary", () => {
    const { container } = render(<SavingsSummary summary={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
