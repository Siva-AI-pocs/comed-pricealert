import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PriceHero from "./PriceHero.jsx";

describe("PriceHero", () => {
  it("shows the current price and its tier label", () => {
    render(<PriceHero stats={{ current_price: 1.7, week_avg: 4.3 }} />);
    expect(screen.getByText("1.7")).toBeInTheDocument(); // hero number (¢ shown separately)
    expect(screen.getByTestId("price-hero")).toHaveAttribute("data-tier", "cheap");
    expect(screen.getByText(/cheap/i)).toBeInTheDocument();
  });

  it("shows the delta vs the 7-day average", () => {
    render(<PriceHero stats={{ current_price: 2, week_avg: 4 }} />);
    expect(screen.getByText(/50%/)).toBeInTheDocument();
    // "7-Day Avg" is also a mini-stat label now, so target the delta sub-line.
    expect(screen.getByText(/vs 7-day avg/i)).toBeInTheDocument();
  });

  it("classifies a spike correctly", () => {
    render(<PriceHero stats={{ current_price: 22, week_avg: 5 }} />);
    expect(screen.getByTestId("price-hero")).toHaveAttribute("data-tier", "spike");
  });
});
