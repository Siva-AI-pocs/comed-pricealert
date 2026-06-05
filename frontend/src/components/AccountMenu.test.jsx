import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test/utils.jsx";
import AccountMenu from "./AccountMenu.jsx";

afterEach(() => vi.restoreAllMocks());

describe("AccountMenu", () => {
  it("shows a Log in button when anonymous and opens the auth modal", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountMenu />, { authed: false });
    const loginBtn = await screen.findByRole("button", { name: /log in/i });
    await user.click(loginBtn);
    // Modal with the auth form appears.
    expect(
      await screen.findByRole("dialog", { name: /account/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it("shows the user email and a Log out action when authenticated", async () => {
    renderWithProviders(<AccountMenu />, { authed: true, user: { id: 9, email: "me@x.com" } });
    expect(await screen.findByText("me@x.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
  });

  it("logging out returns to the anonymous state", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountMenu />, { authed: true, user: { id: 9, email: "me@x.com" } });
    await user.click(await screen.findByRole("button", { name: /log out/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /log in/i })).toBeInTheDocument(),
    );
  });
});
