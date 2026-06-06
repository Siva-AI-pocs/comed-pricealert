import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test/utils.jsx";
import AccountMenu from "./AccountMenu.jsx";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("AccountMenu", () => {
  it("shows a Log in button when anonymous and opens the auth modal", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountMenu />, { authed: false });
    const loginBtn = await screen.findByRole("button", { name: /log in/i });
    await user.click(loginBtn);
    expect(
      await screen.findByRole("dialog", { name: /account/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it("opens a dropdown with a Profile link and Log out, closes on Escape", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountMenu />, {
      authed: true,
      user: { id: 1, email: "u@test.com" },
    });
    const trigger = await screen.findByRole("button", { name: /account menu/i });
    expect(screen.queryByRole("menuitem", { name: "Profile" })).not.toBeInTheDocument();
    await user.click(trigger);
    // The logged-in username is shown at the top of the dropdown.
    expect(screen.getByText("u@test.com")).toBeInTheDocument();
    const profile = screen.getByRole("menuitem", { name: "Profile" });
    expect(profile).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("menuitem", { name: "Log out" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menuitem", { name: "Profile" })).not.toBeInTheDocument();
  });

  it("logging out from the dropdown returns to the anonymous state", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountMenu />, { authed: true, user: { id: 9, email: "me@x.com" } });
    await user.click(await screen.findByRole("button", { name: /account menu/i }));
    await user.click(screen.getByRole("menuitem", { name: "Log out" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /log in/i })).toBeInTheDocument(),
    );
  });
});
