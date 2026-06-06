import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test/utils.jsx";
import AppShell from "./AppShell.jsx";

const renderAt = (path = "/", opts = {}) =>
  renderWithProviders(<AppShell />, { route: path, ...opts });

const DESTINATIONS = ["Now", "Forecast", "Usage & Savings", "Alerts"];

afterEach(() => vi.restoreAllMocks());

describe("AppShell navigation", () => {
  it("the desktop top menu lists every destination (no 'More')", async () => {
    renderAt("/");
    const primary = await screen.findByRole("navigation", { name: /primary/i });
    for (const label of DESTINATIONS) {
      expect(within(primary).getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(within(primary).queryByRole("link", { name: /more/i })).not.toBeInTheDocument();
  });

  it("the hamburger button toggles the mobile side drawer", async () => {
    renderAt("/");
    const btn = await screen.findByRole("button", { name: /menu/i });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
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

  it("links to Privacy and Terms from the footer, and renders those pages", async () => {
    renderAt("/");
    const footer = document.querySelector(".pp-footer");
    expect(within(footer).getByRole("link", { name: /privacy/i })).toBeInTheDocument();
    expect(within(footer).getByRole("link", { name: /terms/i })).toBeInTheDocument();

    renderAt("/privacy");
    expect(await screen.findByTestId("page-privacy")).toBeInTheDocument();
    renderAt("/terms");
    expect(await screen.findByTestId("page-terms")).toBeInTheDocument();
  });

  it("marks the active destination with aria-current", async () => {
    renderAt("/forecast");
    const primary = await screen.findByRole("navigation", { name: /primary/i });
    expect(within(primary).getByRole("link", { name: "Forecast" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
