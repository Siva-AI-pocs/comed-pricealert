import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "../test/utils.jsx";
import AppShell from "./AppShell.jsx";

const renderAt = (path = "/", opts = {}) =>
  renderWithProviders(<AppShell />, { route: path, ...opts });

afterEach(() => vi.restoreAllMocks());

describe("AppShell navigation", () => {
  it("desktop top nav lists all five tabs", async () => {
    renderAt("/");
    const primary = await screen.findByRole("navigation", { name: /primary/i });
    for (const label of ["Now", "Forecast", "Usage & Savings", "Alerts", "More"]) {
      expect(within(primary).getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("mobile bottom nav shows the four phone tabs (Usage folds under More)", async () => {
    renderAt("/");
    const bottom = await screen.findByRole("navigation", { name: /bottom/i });
    for (const label of ["Now", "Forecast", "Alerts", "More"]) {
      expect(within(bottom).getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(
      within(bottom).queryByRole("link", { name: "Usage & Savings" }),
    ).not.toBeInTheDocument();
  });

  it("renders the Now tab at / (public)", async () => {
    renderAt("/");
    expect(await screen.findByTestId("tab-now")).toBeInTheDocument();
  });

  it("renders the Forecast tab at /forecast (public)", async () => {
    renderAt("/forecast");
    expect(await screen.findByTestId("tab-forecast")).toBeInTheDocument();
  });

  it("renders Usage & Savings at /usage when authenticated", async () => {
    renderAt("/usage", { authed: true });
    expect(await screen.findByTestId("tab-usage")).toBeInTheDocument();
  });

  it("renders Alerts at /alerts when authenticated", async () => {
    renderAt("/alerts", { authed: true });
    expect(await screen.findByTestId("tab-alerts")).toBeInTheDocument();
  });

  it("gates a protected route to the login view when anonymous", async () => {
    renderAt("/usage", { authed: false });
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.queryByTestId("tab-usage")).not.toBeInTheDocument();
  });

  it("renders the Privacy and Terms pages on their routes", async () => {
    renderAt("/privacy");
    expect(await screen.findByTestId("page-privacy")).toBeInTheDocument();
    renderAt("/terms");
    expect(await screen.findByTestId("page-terms")).toBeInTheDocument();
  });

  it("marks the active tab with aria-current", async () => {
    renderAt("/forecast");
    const primary = await screen.findByRole("navigation", { name: /primary/i });
    expect(within(primary).getByRole("link", { name: "Forecast" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
