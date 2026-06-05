import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ForecastPlanCards from "./ForecastPlanCards.jsx";

const insights = {
  cheapest: { startIndex: 2, startTs: "2026-06-05T02:00:00", avg: 1.1, conf: 84 },
  ev: { startIndex: 1, startTs: "2026-06-05T01:00:00", avg: 1.6, lengthHours: 6, conf: 72 },
  spike: { index: 17, ts: "2026-06-05T17:00:00", hour: 17, pct: 41 },
};

describe("ForecastPlanCards", () => {
  it("shows cheapest window, EV block and spike risk", () => {
    render(<ForecastPlanCards insights={insights} />);
    expect(screen.getByText(/cheapest window/i)).toBeInTheDocument();
    expect(screen.getByText(/ev charge/i)).toBeInTheDocument();
    expect(screen.getByText(/spike risk/i)).toBeInTheDocument();
    expect(screen.getByText(/84% confidence/i)).toBeInTheDocument();
    expect(screen.getByText(/41%/)).toBeInTheDocument();
  });

  it("renders nothing without insights", () => {
    const { container } = render(<ForecastPlanCards insights={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
