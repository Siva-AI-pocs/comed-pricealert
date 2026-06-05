import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test/utils.jsx";
import { THEMES } from "../theme/themes.js";
import ThemePicker from "./ThemePicker.jsx";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-brand");
});

describe("ThemePicker", () => {
  it("offers all three brands and a mode toggle", async () => {
    renderWithProviders(<ThemePicker />);
    await screen.findByRole("group", { name: /theme/i }); // flush auth bootstrap
    // Exact names: /volt/i would also match "Voltaic".
    expect(screen.getByRole("button", { name: "Voltaic" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Grid" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Volt" })).toBeInTheDocument();
    // Default is light, so the toggle offers switching to dark.
    expect(
      screen.getByRole("button", { name: /switch to dark mode/i }),
    ).toBeInTheDocument();
  });

  it("marks the active brand as pressed (Voltaic by default)", async () => {
    renderWithProviders(<ThemePicker />);
    await screen.findByRole("group", { name: /theme/i }); // flush auth bootstrap
    expect(screen.getByRole("button", { name: /voltaic/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /^grid/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("selecting a brand applies it to the document root", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ThemePicker />);
    await user.click(screen.getByRole("button", { name: /^grid/i }));
    expect(document.documentElement.getAttribute("data-brand")).toBe("grid");
    expect(
      document.documentElement.style.getPropertyValue("--accent"),
    ).toBe(THEMES.grid.light["--accent"]);
    expect(screen.getByRole("button", { name: /^grid/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("toggling mode flips light/dark and updates the toggle's label", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ThemePicker />);
    await user.click(screen.getByRole("button", { name: /switch to dark mode/i }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(
      screen.getByRole("button", { name: /switch to light mode/i }),
    ).toBeInTheDocument();
  });
});
