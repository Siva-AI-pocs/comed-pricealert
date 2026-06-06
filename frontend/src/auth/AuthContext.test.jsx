import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "./AuthContext.jsx";

function mkRes({ ok = true, status = 200, json = {} }) {
  return {
    ok,
    status,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve(json),
    text: () => Promise.resolve(""),
  };
}

function routeFetch(handlers) {
  global.fetch = vi.fn((url, opts) => {
    const key = `${opts?.method || "GET"} ${url}`;
    const handler = handlers[key];
    return Promise.resolve(handler ? handler() : mkRes({ ok: false, status: 404 }));
  });
}

function Probe() {
  const { status, user, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="email">{user?.email || ""}</span>
      <button onClick={() => login("a@b.com", "secret12")}>login</button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

const renderAuth = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );

beforeEach(() => {
  global.fetch = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe("AuthContext", () => {
  it("bootstraps to authenticated when /auth/me succeeds", async () => {
    routeFetch({ "GET /auth/me": () => mkRes({ json: { id: 1, email: "u@test.com" } }) });
    renderAuth();
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated"),
    );
    expect(screen.getByTestId("email")).toHaveTextContent("u@test.com");
  });

  it("bootstraps to anonymous when /auth/me returns 401", async () => {
    routeFetch({ "GET /auth/me": () => mkRes({ ok: false, status: 401 }) });
    renderAuth();
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("anonymous"),
    );
  });

  it("login transitions anonymous -> authenticated", async () => {
    routeFetch({
      "GET /auth/me": () => mkRes({ ok: false, status: 401 }),
      "POST /auth/login": () => mkRes({ json: { id: 2, email: "a@b.com" } }),
    });
    const user = userEvent.setup();
    renderAuth();
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("anonymous"),
    );
    await user.click(screen.getByText("login"));
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated"),
    );
    expect(screen.getByTestId("email")).toHaveTextContent("a@b.com");
  });

  it("logout transitions authenticated -> anonymous", async () => {
    routeFetch({
      "GET /auth/me": () => mkRes({ json: { id: 1, email: "u@test.com" } }),
      "POST /auth/logout": () => mkRes({ json: { message: "ok" } }),
    });
    const user = userEvent.setup();
    renderAuth();
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated"),
    );
    await user.click(screen.getByText("logout"));
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("anonymous"),
    );
  });
});
