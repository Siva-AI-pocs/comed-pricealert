import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test/utils.jsx";
import ProfilePage from "./ProfilePage.jsx";

const USER = {
  id: 1,
  email: "u@test.com",
  created_at: "2026-01-01T00:00:00",
  name: null,
  timezone: null,
};

function okJson(body) {
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(""),
  });
}

beforeEach(() => localStorage.clear());

describe("ProfilePage", () => {
  it("renders the four account sections", async () => {
    renderWithProviders(<ProfilePage />, { authed: true, user: USER });
    expect(await screen.findByRole("heading", { name: "Profile" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Email" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Password" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Account" })).toBeInTheDocument();
  });

  it("saves the profile and shows a success status", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />, { authed: true, user: USER });
    await screen.findByRole("heading", { name: "Profile" });
    // Now make PATCH /auth/me succeed.
    global.fetch = vi.fn((url, opts) =>
      `${opts?.method} ${url}` === "PATCH /auth/me"
        ? okJson({ ...USER, name: "Siva", timezone: "America/Chicago" })
        : Promise.resolve({ ok: false, status: 404, headers: { get: () => "application/json" }, json: () => Promise.resolve({}), text: () => Promise.resolve("") }),
    );
    await user.type(screen.getByLabelText("Display name"), "Siva");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText("Profile saved.")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/auth/me",
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});
