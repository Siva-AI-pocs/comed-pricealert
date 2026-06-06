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

/** Render and open the popover; returns the userEvent instance. */
async function open() {
  const user = userEvent.setup();
  renderWithProviders(<ThemePicker />);
  // The trigger renders immediately, but click flushes the auth bootstrap too.
  await user.click(screen.getByRole("button", { name: /choose theme/i }));
  return user;
}

describe("ThemePicker", () => {
  it("collapses to a single trigger until opened", async () => {
    renderWithProviders(<ThemePicker />);
    const trigger = await screen.findByRole("button", { name: /choose theme/i });
    // Closed by default — no brand buttons visible.
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Voltaic" })).not.toBeInTheDocument();
  });

  it("offers all three brands and a mode toggle once opened", async () => {
    await open();
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
    await open();
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
    const user = await open();
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
    const user = await open();
    await user.click(screen.getByRole("button", { name: /switch to dark mode/i }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(
      screen.getByRole("button", { name: /switch to light mode/i }),
    ).toBeInTheDocument();
  });

  it("closes the popover on Escape", async () => {
    const user = await open();
    expect(screen.getByRole("button", { name: "Voltaic" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Voltaic" })).not.toBeInTheDocument();
  });
});
