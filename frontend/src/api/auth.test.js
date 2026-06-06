import { describe, it, expect, vi, beforeEach } from "vitest";
import { authApi } from "./auth.js";
import { setUnauthorizedHandler } from "./client.js";

function okJson(body) {
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(""),
  });
}

beforeEach(() => {
  global.fetch = vi.fn(() => okJson({ id: 1, email: "u@test.com" }));
});

describe("authApi profile wrappers", () => {
  it("updateProfile PATCHes /auth/me with the fields", async () => {
    await authApi.updateProfile({ name: "Siva", timezone: "America/Chicago" });
    expect(global.fetch).toHaveBeenCalledWith(
      "/auth/me",
      expect.objectContaining({ method: "PATCH" }),
    );
    const [, opts] = global.fetch.mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual({ name: "Siva", timezone: "America/Chicago" });
  });

  it("changeEmail POSTs /auth/change-email", async () => {
    await authApi.changeEmail("new@test.com", "pw");
    expect(global.fetch).toHaveBeenCalledWith(
      "/auth/change-email",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("401 handling for password-gated actions", () => {
  function res401() {
    return Promise.resolve({
      ok: false,
      status: 401,
      headers: { get: () => "application/json" },
      json: () => Promise.resolve({ detail: "Password is incorrect" }),
      text: () => Promise.resolve(""),
    });
  }

  it("changeEmail 401 does NOT trigger the global logout handler", async () => {
    const onUnauth = vi.fn();
    setUnauthorizedHandler(onUnauth);
    global.fetch = vi.fn(() => res401());
    await expect(authApi.changeEmail("new@test.com", "wrong")).rejects.toMatchObject({ status: 401 });
    expect(onUnauth).not.toHaveBeenCalled();
    setUnauthorizedHandler(null);
  });

  it("changePassword 401 does NOT trigger the global logout handler", async () => {
    const onUnauth = vi.fn();
    setUnauthorizedHandler(onUnauth);
    global.fetch = vi.fn(() => res401());
    await expect(authApi.changePassword("wrong", "newpassword1")).rejects.toMatchObject({ status: 401 });
    expect(onUnauth).not.toHaveBeenCalled();
    setUnauthorizedHandler(null);
  });

  it("updateProfile 401 DOES trigger the global logout handler (real session expiry)", async () => {
    const onUnauth = vi.fn();
    setUnauthorizedHandler(onUnauth);
    global.fetch = vi.fn(() => res401());
    await expect(authApi.updateProfile({ name: "x" })).rejects.toMatchObject({ status: 401 });
    expect(onUnauth).toHaveBeenCalledTimes(1);
    setUnauthorizedHandler(null);
  });
});
