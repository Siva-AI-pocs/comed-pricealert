import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatsBar from "./StatsBar.jsx";

const stats = {
  current_price: 1.7,
  hourly_avg: 2.1,
  day_min: 0.9,
  day_max: 8.4,
  week_avg: 4.3,
};

describe("StatsBar", () => {
  it("shows the five summary stats", () => {
    render(<StatsBar stats={stats} />);
    expect(screen.getByText("1.7¢")).toBeInTheDocument();
    expect(screen.getByText("2.1¢")).toBeInTheDocument();
    expect(screen.getByText("0.9¢")).toBeInTheDocument();
    expect(screen.getByText("8.4¢")).toBeInTheDocument();
    expect(screen.getByText("4.3¢")).toBeInTheDocument();
    expect(screen.getByText(/7-day avg/i)).toBeInTheDocument();
  });

  it("renders dashes for missing values", () => {
    render(<StatsBar stats={{}} />);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(5);
  });
});
