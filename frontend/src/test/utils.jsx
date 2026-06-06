import { vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../theme/ThemeContext.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

function jsonRes(json, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve(json),
    text: () => Promise.resolve(""),
  };
}

/**
 * Render a component wrapped in the app's full provider stack
 * (Theme + Auth + Router). `route` sets the initial location.
 *
 * Auth is bootstrapped via a mocked GET /auth/me: `authed` controls whether
 * the session resolves to authenticated (with `user`) or anonymous. Other
 * requests 404 unless the test installs its own fetch mock afterwards.
 */
export function renderWithProviders(
  ui,
  { route = "/", authed = false, user = { id: 1, email: "u@test.com" } } = {},
) {
  global.fetch = vi.fn((url, opts) => {
    const key = `${opts?.method || "GET"} ${url}`;
    if (key === "GET /auth/me") {
      return Promise.resolve(
        authed ? jsonRes(user) : jsonRes({}, { ok: false, status: 401 }),
      );
    }
    return Promise.resolve(jsonRes({}, { ok: false, status: 404 }));
  });

  return render(
    <ThemeProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[route]} future={ROUTER_FUTURE}>
          {ui}
        </MemoryRouter>
      </AuthProvider>
    </ThemeProvider>,
  );
}
