import { describe, it, expect, vi, beforeEach } from "vitest";
import { authApi } from "./auth.js";

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
