import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AccuracyBadge from "./AccuracyBadge.jsx";

describe("AccuracyBadge", () => {
  it("shows MAE and how much closer than day-ahead", () => {
    render(<AccuracyBadge accuracy={{ mae: 0.8, vs_day_ahead_pct: 31, daily: [] }} />);
    expect(screen.getByText(/0\.8/)).toBeInTheDocument();
    expect(screen.getByText(/31% closer/i)).toBeInTheDocument();
  });

  it("shows a tracking state when there is no accuracy data yet", () => {
    render(<AccuracyBadge accuracy={{ mae: null, vs_day_ahead_pct: null, daily: [] }} />);
    expect(screen.getByText(/tracking accuracy/i)).toBeInTheDocument();
  });
});
