import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider } from "../auth/AuthContext.jsx";
import AuthForm from "./AuthForm.jsx";

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
    const h = handlers[key];
    return Promise.resolve(h ? h(opts) : mkRes({ ok: false, status: 404 }));
  });
}

function renderForm(props = {}) {
  return render(
    <AuthProvider>
      <AuthForm {...props} />
    </AuthProvider>,
  );
}

beforeEach(() => {
  routeFetch({ "GET /auth/me": () => mkRes({ ok: false, status: 401 }) });
});
afterEach(() => vi.restoreAllMocks());

describe("AuthForm", () => {
  it("defaults to the login mode", async () => {
    renderForm();
    // await flushes the AuthProvider bootstrap (GET /auth/me) within act.
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log in/i })).toBeInTheDocument();
  });

  it("switches to the register mode", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: /create account/i }));
    expect(
      screen.getByRole("button", { name: /sign up|create account/i }),
    ).toBeInTheDocument();
  });

  it("submits credentials and calls onSuccess on a successful login", async () => {
    const onSuccess = vi.fn();
    routeFetch({
      "GET /auth/me": () => mkRes({ ok: false, status: 401 }),
      "POST /auth/login": (opts) => {
        expect(JSON.parse(opts.body)).toEqual({
          email: "a@b.com",
          password: "secret12",
        });
        return mkRes({ json: { id: 1, email: "a@b.com" } });
      },
    });
    const user = userEvent.setup();
    renderForm({ onSuccess });
    await user.type(screen.getByLabelText(/email/i), "a@b.com");
    await user.type(screen.getByLabelText(/password/i), "secret12");
    await user.click(screen.getByRole("button", { name: /log in/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it("shows the backend error message on a failed login", async () => {
    routeFetch({
      "GET /auth/me": () => mkRes({ ok: false, status: 401 }),
      "POST /auth/login": () =>
        mkRes({ ok: false, status: 401, json: { detail: "Invalid email or password" } }),
    });
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/email/i), "a@b.com");
    await user.type(screen.getByLabelText(/password/i), "wrongpass");
    await user.click(screen.getByRole("button", { name: /log in/i }));
    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
  });

  it("forgot-password sends a code then moves to the reset step", async () => {
    routeFetch({
      "GET /auth/me": () => mkRes({ ok: false, status: 401 }),
      "POST /auth/forgot-password": () => mkRes({ json: { message: "sent" } }),
    });
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: /forgot password/i }));
    await user.type(screen.getByLabelText(/email/i), "a@b.com");
    await user.click(screen.getByRole("button", { name: /send reset code/i }));
    // Reset step asks for the code.
    expect(await screen.findByLabelText(/reset code/i)).toBeInTheDocument();
  });
});
