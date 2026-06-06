import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DecisionBanner from "./DecisionBanner.jsx";

const decision = {
  current_price: 4,
  level: "moderate",
  emoji: "🟡",
  label: "Moderate",
  recommendation: "Moderate — use power as needed.",
  color_class: "moderate",
};

describe("DecisionBanner", () => {
  it("shows the plain-language guidance and tier", () => {
    render(<DecisionBanner decision={decision} />);
    expect(screen.getByText(/use power as needed/i)).toBeInTheDocument();
    expect(screen.getByTestId("decision-banner")).toHaveAttribute(
      "data-tier",
      "moderate",
    );
  });

  it("renders nothing without a decision", () => {
    const { container } = render(<DecisionBanner decision={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
