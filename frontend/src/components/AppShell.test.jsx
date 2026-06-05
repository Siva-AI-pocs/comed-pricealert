import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "../test/utils.jsx";
import AppShell from "./AppShell.jsx";

const renderAt = (path = "/") =>
  renderWithProviders(<AppShell />, { route: path });

describe("AppShell navigation", () => {
  it("desktop top nav lists all five tabs", () => {
    renderAt("/");
    const primary = screen.getByRole("navigation", { name: /primary/i });
    for (const label of ["Now", "Forecast", "Usage & Savings", "Alerts", "More"]) {
      expect(within(primary).getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("mobile bottom nav shows the four phone tabs (Usage folds under More)", () => {
    renderAt("/");
    const bottom = screen.getByRole("navigation", { name: /bottom/i });
    for (const label of ["Now", "Forecast", "Alerts", "More"]) {
      expect(within(bottom).getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(
      within(bottom).queryByRole("link", { name: "Usage & Savings" }),
    ).not.toBeInTheDocument();
  });

  it("renders the Now tab at /", () => {
    renderAt("/");
    expect(screen.getByTestId("tab-now")).toBeInTheDocument();
  });

  it("renders the Forecast tab at /forecast", () => {
    renderAt("/forecast");
    expect(screen.getByTestId("tab-forecast")).toBeInTheDocument();
  });

  it("renders Usage & Savings at /usage and Alerts at /alerts", () => {
    renderAt("/usage");
    expect(screen.getByTestId("tab-usage")).toBeInTheDocument();
    renderAt("/alerts");
    expect(screen.getByTestId("tab-alerts")).toBeInTheDocument();
  });

  it("renders the Privacy and Terms pages on their routes", () => {
    renderAt("/privacy");
    expect(screen.getByTestId("page-privacy")).toBeInTheDocument();
    renderAt("/terms");
    expect(screen.getByTestId("page-terms")).toBeInTheDocument();
  });

  it("marks the active tab with aria-current", () => {
    renderAt("/forecast");
    const primary = screen.getByRole("navigation", { name: /primary/i });
    expect(within(primary).getByRole("link", { name: "Forecast" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
