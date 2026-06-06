import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test/utils.jsx";
import AccountMenu from "./AccountMenu.jsx";

beforeEach(() => localStorage.clear());

describe("AccountMenu (authenticated)", () => {
  it("opens a dropdown with a Profile link and Log out, closes on Escape", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountMenu />, {
      authed: true,
      user: { id: 1, email: "u@test.com" },
    });
    const trigger = await screen.findByRole("button", { name: /u@test\.com/i });
    // Closed initially.
    expect(screen.queryByRole("menuitem", { name: "Profile" })).not.toBeInTheDocument();
    await user.click(trigger);
    const profile = screen.getByRole("menuitem", { name: "Profile" });
    expect(profile).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("menuitem", { name: "Log out" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menuitem", { name: "Profile" })).not.toBeInTheDocument();
  });
});
