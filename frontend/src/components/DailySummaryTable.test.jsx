import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import DailySummaryTable from "./DailySummaryTable.jsx";

const rows = [
  { date: "2026-06-04", min_price: 0.9, max_price: 8.4, avg_price: 3.2 },
  { date: "2026-06-03", min_price: 1.1, max_price: 6.0, avg_price: 2.7 },
];

describe("DailySummaryTable", () => {
  it("renders a row per day with min/max/avg", () => {
    render(<DailySummaryTable rows={rows} />);
    const table = screen.getByRole("table");
    expect(within(table).getByText("2026-06-04")).toBeInTheDocument();
    expect(within(table).getByText("8.4¢")).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(3); // header + 2
  });
});
