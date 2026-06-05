import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "./AuthContext.jsx";
import ProtectedRoute from "./ProtectedRoute.jsx";

function mkRes({ ok = true, status = 200, json = {} }) {
  return {
    ok,
    status,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve(json),
    text: () => Promise.resolve(""),
  };
}

function renderProtected(meHandler) {
  global.fetch = vi.fn((url, opts) => {
    const key = `${opts?.method || "GET"} ${url}`;
    if (key === "GET /auth/me") return Promise.resolve(meHandler());
    return Promise.resolve(mkRes({ ok: false, status: 404 }));
  });
  return render(
    <AuthProvider>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ProtectedRoute>
          <div data-testid="secret">members only</div>
        </ProtectedRoute>
      </MemoryRouter>
    </AuthProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("ProtectedRoute", () => {
  it("renders children when authenticated", async () => {
    renderProtected(() => mkRes({ json: { id: 1, email: "u@test.com" } }));
    await waitFor(() => expect(screen.getByTestId("secret")).toBeInTheDocument());
  });

  it("renders the login view in place (not the children) when anonymous", async () => {
    renderProtected(() => mkRes({ ok: false, status: 401 }));
    // The login form appears…
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log in/i })).toBeInTheDocument();
    // …and the protected content is NOT rendered.
    expect(screen.queryByTestId("secret")).not.toBeInTheDocument();
  });
});
